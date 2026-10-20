#include "ExternalEventReceiver.hpp"
#include "EventProtocol.hpp"
#include <QTcpSocket>
#include <QTimer>
#include <QCryptographicHash>
#include <QHostAddress>
#include <QStringConverter>
namespace tt {
namespace {
constexpr int MaxBody = 64 * 1024, MaxHeaders = 8192, MaxClients = 32;
void count(QJsonObject &stats, const QString &key)
{
	stats[key] = stats[key].toDouble() + 1;
}
bool tokenEqual(const QByteArray &a, const QByteArray &b)
{
	const auto x = QCryptographicHash::hash(a, QCryptographicHash::Sha256),
		   y = QCryptographicHash::hash(b, QCryptographicHash::Sha256);
	unsigned int difference = 0;
	for (int i = 0; i < x.size(); ++i)
		difference |= static_cast<unsigned char>(x[i]) ^ static_cast<unsigned char>(y[i]);
	return difference == 0;
}
} // namespace
ExternalEventReceiver::ExternalEventReceiver(EventDispatcher &d, QObject *parent) : QTcpServer(parent), dispatcher(d)
{
	clock.start();
	connect(this, &QTcpServer::newConnection, this, [this] {
		while (hasPendingConnections()) {
			auto *socket = nextPendingConnection();
			if (clients.size() >= MaxClients) {
				socket->abort();
				socket->deleteLater();
				continue;
			}
			clients.insert(socket);
			socket->setReadBufferSize(MaxBody + MaxHeaders + 1);
			connect(socket, &QTcpSocket::readyRead, this, [this, socket] { receive(socket); });
			connect(socket, &QTcpSocket::disconnected, this, [this, socket] {
				clients.remove(socket);
				socket->deleteLater();
			});
			QTimer::singleShot(5000, socket, [socket] {
				if (!socket->property("websocket").toBool())
					socket->abort();
			});
		}
	});
}
ExternalEventReceiver::~ExternalEventReceiver()
{
	stop();
}
bool ExternalEventReceiver::start(const QJsonObject &settings, std::function<void(const QJsonObject &)> log)
{
	stop();
	options = settings;
	if (log)
		logger = std::move(log);
	if (!options["enabled"].toBool())
		return true;
	if (options["producers"].toArray().size() > 128)
		return false;
	QHostAddress bind(options["bind"].toString("127.0.0.1"));
	const auto port = options["port"].toInt(17453);
	if (!bind.isLoopback() || port < 1 || port > 65535)
		return false;
	return listen(bind, static_cast<quint16>(port));
}
void ExternalEventReceiver::stop()
{
	close();
	const auto sockets = clients;
	for (auto *socket : sockets) {
		socket->abort();
		socket->deleteLater();
	}
	clients.clear();
	rates.clear();
	seen.clear();
	order.clear();
}
QJsonObject ExternalEventReceiver::authenticate(const QByteArray &auth) const
{
	for (const auto &value : options["producers"].toArray()) {
		const auto candidate = value.toObject();
		const auto token = candidate["token"].toString().toUtf8();
		const auto expiry = candidate["expiresAt"].toString();
		const auto expires = QDateTime::fromString(expiry, Qt::ISODateWithMs);
		const auto expectedHash = candidate["tokenHash"].toString().toLatin1();
		const bool matches =
			expectedHash.size() == 64
				? auth.startsWith("Bearer ") && auth.size() >= 39 &&
					  tokenEqual(QCryptographicHash::hash(auth.mid(7), QCryptographicHash::Sha256)
							     .toHex(),
						     expectedHash)
				: token.size() >= 32 && tokenEqual(auth, "Bearer " + token);
		if (!candidate["revoked"].toBool() &&
		    (expiry.isEmpty() || (expires.isValid() && expires > QDateTime::currentDateTimeUtc())) && matches)
			return candidate;
	}
	return {};
}
void ExternalEventReceiver::respond(QTcpSocket *socket, int status, const QJsonObject &body)
{
	if (socket->property("done").toBool())
		return;
	socket->setProperty("done", true);
	socket->readAll();
	if (status >= 400)
		count(counters, "rejected");
	const auto bytes = QJsonDocument(body).toJson(QJsonDocument::Compact);
	const auto reason = status < 400 ? "OK" : "Error";
	socket->write(
		"HTTP/1.1 " + QByteArray::number(status) + " " + reason +
		"\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: " +
		QByteArray::number(bytes.size()) + "\r\n\r\n" + bytes);
	// Drain already in-flight request bytes before closing, so Windows clients
	// can observe early 413/401 responses instead of a TCP reset during upload.
	if (status < 400)
		socket->disconnectFromHost();
	else
		QTimer::singleShot(100, socket, [socket] {
			socket->readAll();
			socket->disconnectFromHost();
		});
}
QJsonObject ExternalEventReceiver::publish(QJsonObject event, const QJsonObject &producer, int &status)
{
	count(counters, "incoming");
	const auto started = clock.elapsed();
	const auto reject = [&](int code, const QString &error) {
		status = code;
		if (logger)
			logger({{"id", event.value("id")},
				{"source", producer.value("source")},
				{"type", event.value("type")},
				{"result", error},
				{"latencyMs", static_cast<double>(clock.elapsed() - started)}});
		return QJsonObject{{"error", error}};
	};
	const auto source = producer["source"].toString();
	if (!QRegularExpression("^external\\.[a-z0-9_.-]+$").match(source).hasMatch())
		return reject(403, "PRODUCER_INVALID");
	auto &rate = rates[source];
	const auto window = clock.elapsed() / 1000;
	if (rate.first != window)
		rate = {window, 0};
	const auto limit = qBound(1, producer["rateLimit"].toInt(60), 600);
	if (++rate.second > limit)
		return reject(429, "RATE_LIMIT");
	const auto type = event["type"].toString();
	if (!producer["types"].toArray().contains(type) || type.startsWith("obs.") || type.startsWith("system."))
		return reject(403, "NAMESPACE_DENIED");
	if (type.startsWith("tiktok.") && !producer["trustedTikTok"].toBool())
		return reject(403, "NAMESPACE_DENIED");
	if (!uw::validEvent(event))
		return reject(422, "INVALID_SCHEMA");
	const auto payloads = QJsonDocument::fromJson(uw::payloadsSchema).object()["definitions"].toObject();
	if (!payloads.contains(type)) {
		const auto schema = options["payloadSchemas"].toObject()[type].toObject();
		if (schema.isEmpty())
			return reject(422, "UNREGISTERED_EVENT_TYPE");
		if (!uw::supportedSchema(schema))
			return reject(422, "UNSUPPORTED_SCHEMA");
		if (!uw::validate(schema, event["data"], schema))
			return reject(422, "INVALID_PAYLOAD");
	}
	if (event.value("metadata").toObject()["hopCount"].toInt() >= 4 ||
	    event.value("metadata").toObject()["originInstance"].toString().startsWith("obs."))
		return reject(422, "LOOP_REJECTED");
	// Authenticated identity is authoritative; clients cannot choose another source.
	event["source"] = source;
	const auto key = type + ":" + (type.startsWith("tiktok.") ? QString{} : source + ":") + event["id"].toString();
	if (seen.contains(key)) {
		count(counters, "deduplicated");
		status = 200;
		return {{"result", "duplicate"}};
	}
	const auto dispatched = dispatcher.pushDetailed(event);
	if (dispatched == DispatchResult::Duplicate) {
		count(counters, "deduplicated");
		status = 200;
		return {{"result", "duplicate"}};
	}
	if (dispatched != DispatchResult::Accepted) {
		count(counters, "dropped");
		return reject(503, "QUEUE_FULL");
	}
	seen.insert(key);
	order.push_back(key);
	if (order.size() > 8192) {
		seen.remove(order.front());
		order.pop_front();
	}
	count(counters, "accepted");
	status = 202;
	if (logger)
		logger({{"id", event["id"]},
			{"source", source},
			{"type", type},
			{"result", "accepted"},
			{"latencyMs", static_cast<double>(clock.elapsed() - started)}});
	return {{"result", "accepted"}, {"id", event["id"]}};
}
void ExternalEventReceiver::receive(QTcpSocket *socket)
{
	if (socket->property("websocket").toBool()) {
		receiveFrames(socket);
		return;
	}
	if (socket->property("done").toBool()) {
		socket->readAll();
		return;
	}
	auto bytes = socket->peek(MaxBody + MaxHeaders + 1);
	if (bytes.size() > MaxBody + MaxHeaders) {
		respond(socket, 413, {{"error", "PAYLOAD_TOO_LARGE"}});
		return;
	}
	const auto end = bytes.indexOf("\r\n\r\n");
	if (end < 0) {
		if (bytes.size() > MaxHeaders)
			respond(socket, 431, {{"error", "HEADERS_TOO_LARGE"}});
		return;
	}
	if (end > MaxHeaders) {
		respond(socket, 431, {{"error", "HEADERS_TOO_LARGE"}});
		return;
	}
	const auto lines = bytes.left(end).split('\n');
	const auto request = lines.value(0).trimmed().split(' ');
	if (request.size() != 3 || request[2] != "HTTP/1.1") {
		respond(socket, 400, {{"error", "BAD_REQUEST"}});
		return;
	}
	QHash<QByteArray, QByteArray> headers;
	for (int i = 1; i < lines.size(); ++i) {
		const auto line = lines[i].trimmed();
		const auto colon = line.indexOf(':');
		const auto key = line.left(colon).toLower();
		if (colon <= 0 || headers.contains(key)) {
			respond(socket, 400, {{"error", "BAD_HEADERS"}});
			return;
		}
		headers[key] = line.mid(colon + 1).trimmed();
	}
	// No browser origins are allowed on this machine-to-machine surface.
	if (headers.contains("origin") || headers.contains("transfer-encoding")) {
		respond(socket, 403, {{"error", "ORIGIN_OR_PROTOCOL_DENIED"}});
		return;
	}
	const auto host = headers.value("host");
	if (host != "127.0.0.1:" + QByteArray::number(serverPort()) &&
	    host != "[::1]:" + QByteArray::number(serverPort())) {
		respond(socket, 403, {{"error", "HOST_DENIED"}});
		return;
	}
	bool lengthOK = false;
	const auto length = headers.value("content-length", "0").toLongLong(&lengthOK);
	if (!lengthOK || length < 0) {
		respond(socket, 400, {{"error", "BAD_LENGTH"}});
		return;
	}
	if (length > MaxBody) {
		respond(socket, 413, {{"error", "PAYLOAD_TOO_LARGE"}});
		return;
	}
	if (bytes.size() < end + 4 + length)
		return;
	if (bytes.size() != end + 4 + length) {
		respond(socket, 400, {{"error", "PIPELINING_DENIED"}});
		return;
	}
	const auto method = request[0], route = request[1];
	if (method == "GET" && route == "/v1/health") {
		respond(socket, 200, {{"ok", true}, {"version", 1}});
		return;
	}
	const auto producer = authenticate(headers.value("authorization"));
	if (producer.isEmpty()) {
		respond(socket, 401, {{"error", "UNAUTHORIZED"}});
		return;
	}
	const auto scopes = producer["scopes"].toArray();
	if (method == "GET" && route == "/v1/ws" && headers.value("upgrade").toLower() == "websocket") {
		if (!scopes.contains("publish")) {
			respond(socket, 403, {{"error", "SCOPE_DENIED"}});
			return;
		}
		const auto key = headers.value("sec-websocket-key");
		const auto decoded = QByteArray::fromBase64Encoding(key, QByteArray::AbortOnBase64DecodingErrors);
		if (headers.value("sec-websocket-version") != "13" ||
		    !headers.value("connection").toLower().split(',').contains("upgrade") || !decoded ||
		    decoded.decoded.size() != 16 || length != 0) {
			respond(socket, 400, {{"error", "BAD_WEBSOCKET_HANDSHAKE"}});
			return;
		}
		const auto accept =
			QCryptographicHash::hash(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", QCryptographicHash::Sha1)
				.toBase64();
		socket->read(end + 4);
		socket->setProperty("websocket", true);
		socket->setProperty("wsAuth", headers.value("authorization"));
		socket->write(
			"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
			accept + "\r\n\r\n");
		return;
	}
	if (headers.contains("upgrade")) {
		respond(socket, 403, {{"error", "PROTOCOL_DENIED"}});
		return;
	}
	if (method == "GET" && route == "/v1/events/types") {
		if (!scopes.contains("read")) {
			respond(socket, 403, {{"error", "SCOPE_DENIED"}});
			return;
		}
		respond(socket, 200, {{"version", 1}, {"types", producer["types"]}});
		return;
	}
	if (method == "GET" && route == "/v1/metrics") {
		if (!scopes.contains("read")) {
			respond(socket, 403, {{"error", "SCOPE_DENIED"}});
			return;
		}
		const auto stats = dispatcher.snapshot();
		respond(socket, 200,
			{{"receiver", counters},
			 {"dispatcher", QJsonObject{{"delivered", static_cast<double>(stats.delivered)},
						    {"failed", static_cast<double>(stats.failed)},
						    {"overflow", static_cast<double>(stats.overflow)}}}});
		return;
	}
	if (method != "POST" || (route != "/v1/events" && route != "/v1/events/batch")) {
		respond(socket, 404, {{"error", "NOT_FOUND"}});
		return;
	}
	if (!scopes.contains("publish")) {
		respond(socket, 403, {{"error", "SCOPE_DENIED"}});
		return;
	}
	if (headers.value("content-type").split(';')[0].trimmed() != "application/json") {
		respond(socket, 415, {{"error", "JSON_REQUIRED"}});
		return;
	}
	QJsonParseError error;
	const auto doc = QJsonDocument::fromJson(bytes.mid(end + 4), &error);
	if (error.error != QJsonParseError::NoError) {
		respond(socket, 400, {{"error", "INVALID_JSON"}});
		return;
	}
	if (route == "/v1/events") {
		if (!doc.isObject()) {
			respond(socket, 422, {{"error", "INVALID_SCHEMA"}});
			return;
		}
		int status;
		const auto result = publish(doc.object(), producer, status);
		respond(socket, status, result);
		return;
	}
	if (!doc.isArray() || doc.array().isEmpty() || doc.array().size() > 64) {
		respond(socket, 422, {{"error", "INVALID_BATCH"}});
		return;
	}
	QJsonArray results;
	for (const auto &value : doc.array()) {
		int status;
		auto result = publish(value.toObject(), producer, status);
		result["status"] = status;
		results.append(result);
	}
	respond(socket, 200, {{"results", results}});
}
void ExternalEventReceiver::sendFrame(QTcpSocket *socket, unsigned char opcode, const QByteArray &payload)
{
	QByteArray frame;
	frame.append(char(0x80 | opcode));
	if (payload.size() < 126)
		frame.append(char(payload.size()));
	else {
		frame.append(char(126));
		frame.append(char((payload.size() >> 8) & 255));
		frame.append(char(payload.size() & 255));
	}
	socket->write(frame + payload);
}
void ExternalEventReceiver::receiveFrames(QTcpSocket *socket)
{
	auto bytes = socket->property("wsBuffer").toByteArray() + socket->readAll();
	const auto close = [&](int code) {
		QByteArray payload;
		payload.append(char(code >> 8));
		payload.append(char(code & 255));
		sendFrame(socket, 8, payload);
		socket->setProperty("done", true);
		socket->disconnectFromHost();
	};
	if (socket->property("done").toBool())
		return;
	if (bytes.size() > MaxBody + MaxHeaders) {
		close(1009);
		return;
	}
	int frames = 0;
	while (bytes.size() >= 2 && frames++ < 128) {
		if (socket->bytesToWrite() > MaxBody) {
			count(counters, "dropped");
			close(1008);
			return;
		}
		const auto first = static_cast<unsigned char>(bytes[0]), second = static_cast<unsigned char>(bytes[1]);
		const int opcode = first & 15;
		const bool fin = first & 128;
		if ((first & 0x70) || !(second & 128) ||
		    (opcode != 0 && opcode != 1 && opcode != 8 && opcode != 9 && opcode != 10)) {
			close(1002);
			return;
		}
		quint64 length = second & 127;
		int header = 2;
		if (length == 126) {
			if (bytes.size() < 4)
				break;
			length = (static_cast<unsigned char>(bytes[2]) << 8) | static_cast<unsigned char>(bytes[3]);
			header = 4;
			if (length < 126) {
				close(1002);
				return;
			}
		} else if (length == 127) {
			if (bytes.size() < 10)
				break;
			length = 0;
			for (int i = 2; i < 10; ++i)
				length = (length << 8) | static_cast<unsigned char>(bytes[i]);
			header = 10;
			if (length < 65536 || (static_cast<unsigned char>(bytes[2]) & 128)) {
				close(1002);
				return;
			}
		}
		if (length > MaxBody) {
			close(1009);
			return;
		}
		if (opcode >= 8 && (!fin || length > 125)) {
			close(1002);
			return;
		}
		if (bytes.size() < header + 4 + static_cast<qsizetype>(length))
			break;
		auto payload = bytes.mid(header + 4, static_cast<qsizetype>(length));
		for (int i = 0; i < payload.size(); ++i)
			payload[i] = payload[i] ^ bytes[header + i % 4];
		bytes.remove(0, header + 4 + static_cast<qsizetype>(length));
		if (opcode == 8) {
			if (payload.size() == 1) {
				close(1002);
				return;
			}
			close(1000);
			return;
		}
		if (opcode == 9) {
			sendFrame(socket, 10, payload);
			continue;
		}
		if (opcode == 10)
			continue;
		auto message = socket->property("wsMessage").toByteArray();
		const bool fragmented = socket->property("wsFragmented").toBool();
		if ((opcode == 0 && !fragmented) || (opcode == 1 && fragmented)) {
			close(1002);
			return;
		}
		message += payload;
		if (message.size() > MaxBody) {
			close(1009);
			return;
		}
		if (!fin) {
			socket->setProperty("wsFragmented", true);
			socket->setProperty("wsMessage", message);
			continue;
		}
		socket->setProperty("wsFragmented", false);
		socket->setProperty("wsMessage", QByteArray{});
		QStringDecoder decoder(QStringDecoder::Utf8);
		const QString decodedText = decoder.decode(message);
		Q_UNUSED(decodedText);
		if (decoder.hasError()) {
			close(1007);
			return;
		}
		const auto producer = authenticate(socket->property("wsAuth").toByteArray());
		if (producer.isEmpty() || !producer["scopes"].toArray().contains("publish")) {
			close(1008);
			return;
		}
		if (socket->bytesToWrite() > MaxBody) {
			count(counters, "dropped");
			close(1008);
			return;
		}
		QJsonParseError error;
		const auto doc = QJsonDocument::fromJson(message, &error);
		int status = 422;
		QJsonObject result{{"error", "INVALID_SCHEMA"}};
		if (error.error == QJsonParseError::NoError && doc.isObject())
			result = publish(doc.object(), producer, status);
		if (status >= 400)
			count(counters, "rejected");
		result["status"] = status;
		sendFrame(socket, 1, QJsonDocument(result).toJson(QJsonDocument::Compact));
	}
	socket->setProperty("wsBuffer", bytes);
	if (frames >= 128 && bytes.size() >= 2)
		QTimer::singleShot(0, socket, [this, socket] { receiveFrames(socket); });
}
} // namespace tt
