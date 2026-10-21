#include "universal/ExternalEventReceiver.hpp"
#include "universal/EventProtocol.hpp"
#include <QCoreApplication>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QEventLoop>
#include <QTimer>
#include <QFile>
#include <QCryptographicHash>
#include <iostream>
#include <stdexcept>
using namespace tt;
void check(bool value, const char *message)
{
	if (!value)
		throw std::runtime_error(message);
}
QJsonObject fixture()
{
	QFile f(QString(UNIVERSAL_FIXTURES) + "/custom.alert.json");
	check(f.open(QIODevice::ReadOnly), "fixture open");
	return QJsonDocument::fromJson(f.readAll()).object();
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	try {
		EventDispatcher dispatcher(4);
		ExternalEventReceiver server(dispatcher);
		QTcpServer probe;
		check(probe.listen(QHostAddress::LocalHost, 0), "port probe");
		const auto port = probe.serverPort();
		probe.close();
		const QString token(64, 'a');
		QJsonObject producer{{"source", "external.test"},
				     {"token", token},
				     {"scopes", QJsonArray{"read", "publish"}},
				     {"types", QJsonArray{"custom.alert", "tiktok.gift"}},
				     {"rateLimit", 600}};
		QJsonObject config{{"enabled", true}, {"port", port}, {"producers", QJsonArray{producer}}};
		check(server.start(config), "receiver starts");
		check(server.serverAddress().isLoopback(), "loopback bind");
		QNetworkAccessManager network;
		auto request = [&](const QByteArray &body, const QString &route = "/v1/events",
				   const QByteArray &auth = QByteArray(), bool origin = false,
				   const QByteArray &method = "POST") {
			QNetworkRequest req(QUrl(QString("http://127.0.0.1:%1%2").arg(port).arg(route)));
			req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
			if (!auth.isEmpty())
				req.setRawHeader("Authorization", "Bearer " + auth);
			if (origin)
				req.setRawHeader("Origin", "https://evil.example");
			auto *reply = network.sendCustomRequest(req, method, body);
			QEventLoop loop;
			QTimer timeout;
			timeout.setSingleShot(true);
			QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
			QObject::connect(&timeout, &QTimer::timeout, &loop, &QEventLoop::quit);
			timeout.start(3000);
			loop.exec();
			const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
			const auto result = reply->readAll();
			reply->abort();
			reply->deleteLater();
			return qMakePair(status, result);
		};
		const auto bytes = QJsonDocument(fixture()).toJson(QJsonDocument::Compact);
		check(request(bytes).first == 401, "unauthenticated rejected");
		check(request({}, "/v1/health", {}, false, "GET").first == 200, "minimal health");
		check(request({}, "/v1/events/types", token.toUtf8(), false, "GET").first == 200,
		      "version negotiation");
		check(request(bytes, "/v1/events", token.toUtf8(), true).first == 403, "browser origin denied");
		check(request(bytes, "/v1/events", token.toUtf8()).first == 202, "valid event accepted");
		const auto delivered = dispatcher.take();
		check(delivered.size() == 1 && uw::validEvent(delivered.first()), "one valid routed event");
		auto optional = fixture();
		optional.remove("metadata");
		optional["id"] = "optional-metadata";
		check(request(QJsonDocument(optional).toJson(), "/v1/events", token.toUtf8()).first == 202,
		      "optional metadata accepted");
		check(uw::validEvent(dispatcher.take().first()), "optional fields must not be mutated to null");
		auto duplicate = request(bytes, "/v1/events", token.toUtf8());
		check(duplicate.first == 200 && duplicate.second.contains("duplicate"), "dedup acknowledged");
		check(dispatcher.take().isEmpty(), "duplicate not delivered");
		auto bad = fixture();
		bad["version"] = 2;
		check(request(QJsonDocument(bad).toJson(), "/v1/events", token.toUtf8()).first == 422, "bad schema");
		bad = fixture();
		bad["type"] = "tiktok.gift";
		check(request(QJsonDocument(bad).toJson(), "/v1/events", token.toUtf8()).first == 403,
		      "untrusted tiktok denied");
		bad = fixture();
		bad["data"] = QJsonObject{{"title", "ok"}, {"command", "obs.shutdown"}};
		check(request(QJsonDocument(bad).toJson(), "/v1/events", token.toUtf8()).first == 422,
		      "command-like unknown alert fields rejected");
		check(request("{bad", "/v1/events", token.toUtf8()).first == 400, "malformed JSON");
		const auto oversized = request(QByteArray(65537, 'x'), "/v1/events", token.toUtf8());
		if (oversized.first != 413)
			std::cerr << "oversized status=" << oversized.first << " body=" << oversized.second.constData()
				  << '\n';
		check(oversized.first == 413, "body limit");
		check(request("[]", "/v1/events/batch", token.toUtf8()).first == 422, "empty batch rejected");
		// Native legacy processing must survive either arrival order.
		EventDispatcher first;
		auto native = QJsonObject{{"version", 1},
					  {"type", "gift"},
					  {"room", "42"},
					  {"method", "WebcastGiftMessage"},
					  {"messageId", "18446744073709551615"},
					  {"receivedTimestamp", "1792504800000"},
					  {"data", QJsonObject{}}};
		const auto canonical = uw::fromNative(native);
		check(first.push(native), "native accepted");
		check(first.pushDetailed(canonical) == DispatchResult::Duplicate, "native-first dedup");
		EventDispatcher second;
		check(second.push(canonical), "bridge first");
		check(second.push(native), "native still delivered to legacy");
		const auto batch = second.take();
		check(batch.size() == 2 && batch[1]["_universalDuplicate"].toBool(),
		      "only canonical delivery suppressed");
		check(uw::validEvent(fixture()), "shared valid fixture");
		QFile corpus(QString(UNIVERSAL_FIXTURES) + "/conformance.json");
		check(corpus.open(QIODevice::ReadOnly), "conformance corpus");
		for (const auto &item : QJsonDocument::fromJson(corpus.readAll()).array()) {
			const auto c = item.toObject();
			check(uw::validEvent(c["event"].toObject()) == c["valid"].toBool(),
			      qPrintable(c["name"].toString()));
		}
		bad = fixture();
		bad["timestamp"] = "2026-02-30T00:00:00Z";
		check(!uw::validEvent(bad), "invalid calendar rejected");
		// Authenticated WS: header required before upgrade; publish framing is the envelope itself.
		QTcpSocket ws;
		QEventLoop wsLoop;
		QTimer wsTimeout;
		wsTimeout.setSingleShot(true);
		bool acknowledged = false, upgraded = false;
		QByteArray wsResponse;
		QObject::connect(&ws, &QTcpSocket::connected, &ws, [&] {
			ws.write(
				"GET /v1/ws HTTP/1.1\r\nHost: 127.0.0.1:" + QByteArray::number(port) +
				"\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nAuthorization: Bearer " +
				token.toUtf8() + "\r\n\r\n");
		});
		QObject::connect(&ws, &QTcpSocket::readyRead, &ws, [&] {
			wsResponse += ws.readAll();
			if (!upgraded) {
				if (!wsResponse.contains("\r\n\r\n"))
					return;
				check(wsResponse.startsWith("HTTP/1.1 101"), "WS handshake");
				upgraded = true;
				wsResponse.clear();
				auto e = fixture();
				e["id"] = "ws-event";
				const auto payload = QJsonDocument(e).toJson(QJsonDocument::Compact);
				QByteArray frame;
				frame.append(char(0x81));
				frame.append(char(0x80 | 126));
				frame.append(char(payload.size() >> 8));
				frame.append(char(payload.size() & 255));
				frame.append("abcd");
				for (int i = 0; i < payload.size(); ++i)
					frame.append(char(payload[i] ^ "abcd"[i % 4]));
				ws.write(frame);
			} else if (wsResponse.contains("accepted")) {
				acknowledged = true;
				wsLoop.quit();
			}
		});
		QObject::connect(&wsTimeout, &QTimer::timeout, &wsLoop, &QEventLoop::quit);
		wsTimeout.start(3000);
		ws.connectToHost(QHostAddress::LocalHost, port);
		wsLoop.exec();
		check(acknowledged, "authenticated websocket publication");
		ws.abort();
		producer["tokenHash"] = QString::fromLatin1(
			QCryptographicHash::hash(token.toUtf8(), QCryptographicHash::Sha256).toHex());
		producer.remove("token");
		config["producers"] = QJsonArray{producer};
		check(server.start(config), "hashed credential restart");
		check(request(bytes, "/v1/events", token.toUtf8()).first == 200,
		      "hashed verifier accepts paired token");
		check(request(bytes, "/v1/events", QByteArray(64, 'b')).first == 401, "incorrect paired token denied");
		producer["rateLimit"] = 1;
		config["producers"] = QJsonArray{producer};
		check(server.start(config), "quota restart");
		request(bytes, "/v1/events", token.toUtf8());
		check(request(bytes, "/v1/events", token.toUtf8()).first == 429,
		      "duplicates still consume producer quota");
		producer["expiresAt"] = "2000-01-01T00:00:00Z";
		config["producers"] = QJsonArray{producer};
		check(server.start(config), "restart");
		check(request(bytes, "/v1/events", token.toUtf8()).first == 401, "expired token rejected");
		config["bind"] = "0.0.0.0";
		check(!server.start(config), "remote binding rejected");
		server.stop();
		check(!server.isListening(), "shutdown");
		std::cout
			<< "Universal receiver HTTP/WS, auth, schemas, limits, identity, legacy compatibility and shutdown passed\n";
	} catch (const std::exception &e) {
		std::cerr << e.what() << '\n';
		return 1;
	}
}
