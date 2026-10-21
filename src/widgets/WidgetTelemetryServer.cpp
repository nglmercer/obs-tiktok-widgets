#include "WidgetTelemetryServer.hpp"
#include <QTcpSocket>
#include <QTimer>
#include <QJsonDocument>
#include <QSaveFile>
#include <QFile>
#include <QDir>
#include <QRandomGenerator>
#include <memory>
namespace tt {
WidgetTelemetryServer::WidgetTelemetryServer(WidgetHealthManager &h, QString id, QObject *p)
	: QObject(p),
	  health(h),
	  session(std::move(id))
{
}
WidgetTelemetryServer::~WidgetTelemetryServer()
{
	stop();
}
bool WidgetTelemetryServer::start(const QString &directory)
{
	stop();
	clock.start();
	for (int i = 0; i < 8; ++i)
		token += QByteArray::number(QRandomGenerator::system()->generate(), 16).rightJustified(8, '0');
	server.setMaxPendingConnections(8);
	if (!server.listen(QHostAddress::LocalHost, 0))
		return false;
	const auto dir = directory + "/runtime-session";
	if (!QDir().mkpath(dir) ||
	    !QFile::setPermissions(dir, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner)) {
		stop();
		return false;
	}
	bootstrap = dir + "/health.js";
	QSaveFile file(bootstrap);
	if (!file.open(QIODevice::WriteOnly)) {
		stop();
		return false;
	}
	file.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
	const auto json =
		QJsonDocument(
			QJsonObject{{"sessionId", session},
				    {"token", QString::fromLatin1(token)},
				    {"endpoint", QString("http://127.0.0.1:%1/widget-health/v1/report").arg(port())}})
			.toJson(QJsonDocument::Compact);
	if (file.write("window.TikTokWidgetHealthSession=" + json + ";\n") < 0 || !file.commit()) {
		stop();
		return false;
	}
	connect(&server, &QTcpServer::newConnection, this, [this] {
		while (server.hasPendingConnections()) {
			auto *socket = server.nextPendingConnection();
			++connections;
			if (!socket->peerAddress().isLoopback() || server.findChildren<QTcpSocket *>().size() > 16) {
				socket->abort();
				socket->deleteLater();
				continue;
			}
			socket->setReadBufferSize(12289);
			auto buffer = std::make_shared<QByteArray>();
			auto *timer = new QTimer(socket);
			timer->setSingleShot(true);
			timer->start(2000);
			connect(timer, &QTimer::timeout, socket, &QTcpSocket::abort);
			connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
			const auto receive = [this, socket, buffer, timer] {
				if (socket->property("handled").toBool())
					return;
				*buffer += socket->read(12289 - buffer->size());
				const auto reply = [this, socket, timer](int status, const QByteArray &origin = {}) {
					lastStatus = status;
					socket->setProperty("handled", true);
					timer->stop();
					QByteArray response =
						"HTTP/1.1 " + QByteArray::number(status) +
						" Result\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n";
					if (!origin.isEmpty())
						response +=
							"Access-Control-Allow-Origin: " + origin +
							"\r\nVary: Origin\r\nAccess-Control-Allow-Methods: POST\r\nAccess-Control-Allow-Headers: content-type, x-widget-health-token\r\nAccess-Control-Allow-Private-Network: true\r\n";
					socket->write(response + "\r\n");
					socket->disconnectFromHost();
				};
				if (buffer->size() > 12288) {
					reply(413);
					return;
				}
				const auto end = buffer->indexOf("\r\n\r\n");
				if (end < 0) {
					if (buffer->size() > 4096)
						reply(431);
					return;
				}
				if (end > 4096) {
					reply(431);
					return;
				}
				const auto lines = buffer->left(end).split('\n');
				QMap<QByteArray, QByteArray> headers;
				for (int i = 1; i < lines.size(); ++i) {
					const auto line = lines[i].trimmed();
					const auto colon = line.indexOf(':');
					if (colon < 1) {
						reply(400);
						return;
					}
					const auto key = line.left(colon).toLower();
					if (headers.contains(key)) {
						reply(400);
						return;
					}
					headers[key] = line.mid(colon + 1).trimmed();
				}
				const auto origin = headers.value("origin");
				originCategory =
					(origin == "null" || origin == "http://absolute" || origin == "file://")
						? QString::fromLatin1(origin)
						: (origin.isEmpty() ? "absent" : "untrusted");
				// OBS virtual local-file scheme is http://absolute; normal local files use null.
				if (headers.value("host") != "127.0.0.1:" + QByteArray::number(port()) ||
				    (origin != "null" && origin != "http://absolute") ||
				    headers.contains("transfer-encoding")) {
					reply(403);
					return;
				}
				const auto request = lines[0].trimmed();
				if (request == "OPTIONS /widget-health/v1/report HTTP/1.1") {
					if (headers.value("access-control-request-method") != "POST") {
						reply(403);
						return;
					}
					reply(204, origin);
					return;
				}
				if (request != "POST /widget-health/v1/report HTTP/1.1" ||
				    headers.value("content-type") != "application/json") {
					reply(400);
					return;
				}
				const auto supplied = headers.value("x-widget-health-token");
				unsigned difference = supplied.size() ^ token.size();
				for (int i = 0; i < token.size(); ++i)
					difference |= unsigned(token[i] ^ (i < supplied.size() ? supplied[i] : 0));
				if (difference) {
					reply(403);
					return;
				}
				bool valid = false;
				const auto length = headers.value("content-length").toInt(&valid);
				if (!valid || length < 1 || length > 8192) {
					reply(413);
					return;
				}
				if (buffer->size() < end + 4 + length)
					return;
				if (buffer->size() != end + 4 + length) {
					reply(400);
					return;
				}
				const auto now = clock.elapsed();
				if (now - window >= 1000) {
					window = now;
					requests = 0;
				}
				if (++requests > 200) {
					reply(429, origin);
					return;
				}
				const auto doc = QJsonDocument::fromJson(buffer->mid(end + 4, length));
				const auto packet = doc.object();
				const auto id = packet["instanceId"].toString();
				if (id.isEmpty() || id.size() > 128 || (rates.size() >= 256 && !rates.contains(id))) {
					reply(400);
					return;
				}
				auto &rate = rates[id];
				if (now - rate.first >= 1000)
					rate = {now, 0};
				if (++rate.second > 20) {
					reply(429, origin);
					return;
				}
				if (!doc.isObject() || !health.report(packet, now)) {
					reply(400, origin);
					return;
				}
				reply(204, origin);
			};
			connect(socket, &QTcpSocket::readyRead, this, receive);
			if (socket->bytesAvailable() > 0)
				QTimer::singleShot(0, socket, receive);
		}
	});
	return true;
}
void WidgetTelemetryServer::stop()
{
	disconnect(&server, nullptr, this, nullptr);
	server.close();
	for (auto *s : server.findChildren<QTcpSocket *>()) {
		s->disconnect(this);
		s->abort();
		s->deleteLater();
	}
	if (!bootstrap.isEmpty())
		QFile::remove(bootstrap);
	bootstrap.clear();
	token.clear();
	rates.clear();
	window = 0;
	requests = 0;
}
} // namespace tt
