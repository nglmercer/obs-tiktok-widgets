#include "widgets/WidgetTelemetryServer.hpp"
#include <QCoreApplication>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QFile>
#include <QJsonDocument>
#include <QThread>
#include <stdexcept>
using namespace tt;
static void check(bool ok)
{
	if (!ok)
		throw std::runtime_error("telemetry invariant failed");
}
static QByteArray exchange(WidgetTelemetryServer &server, QByteArray request)
{
	QTcpSocket socket;
	socket.connectToHost(QHostAddress::LocalHost, server.port());
	check(socket.waitForConnected(1000));
	socket.write(request);
	socket.flush();
	QElapsedTimer timer;
	timer.start();
	QByteArray response;
	while (timer.elapsed() < 1000 && !response.contains("\r\n\r\n")) {
		QCoreApplication::processEvents();
		response += socket.readAll();
		QThread::msleep(1);
	}
	return response;
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	QTemporaryDir dir;
	WidgetHealthManager health("session");
	WidgetTelemetryServer server(health, "session");
	check(server.start(dir.path()));
	QFile file(dir.path() + "/runtime-session/health.js");
	check(file.open(QIODevice::ReadOnly));
	auto bytes = file.readAll();
	const auto start = bytes.indexOf('{'), end = bytes.lastIndexOf('}');
	const auto config = QJsonDocument::fromJson(bytes.mid(start, end - start + 1)).object();
	check(!(file.permissions() & (QFileDevice::ReadOther | QFileDevice::ReadGroup)));
	const auto token = config["token"].toString().toUtf8();
	const auto host = QByteArray("Host: 127.0.0.1:") + QByteArray::number(server.port()) + "\r\n";
	const auto body = QJsonDocument(QJsonObject{{"protocol", "widget-health/v1"},
						    {"sessionId", "session"},
						    {"widgetId", "widget"},
						    {"instanceId", "page"},
						    {"buildId", "build"},
						    {"kind", "ready"},
						    {"data", QJsonObject{{"widgetMounted", true}}}})
				  .toJson(QJsonDocument::Compact);
	const auto post = [&](QByteArray origin, QByteArray capability) {
		return QByteArray("POST /widget-health/v1/report HTTP/1.1\r\n") + host + "Origin: " + origin +
		       "\r\nContent-Type: application/json\r\nX-Widget-Health-Token: " + capability +
		       "\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body;
	};
	check(exchange(server, post("null", "invalid")).startsWith("HTTP/1.1 403"));
	check(exchange(server, post("https://evil.example", token)).startsWith("HTTP/1.1 403"));
	check(exchange(server, post("null", token)).startsWith("HTTP/1.1 204"));
	check(exchange(server, post("http://absolute", token)).startsWith("HTTP/1.1 204"));
	check(health.snapshot(server.now())["instances"].toArray().size() == 1);
	check(exchange(server, QByteArray("OPTIONS /widget-health/v1/report HTTP/1.1\r\n") + host +
				       "Origin: null\r\nAccess-Control-Request-Method: POST\r\n\r\n")
		      .contains("Access-Control-Allow-Origin: null"));
	check(exchange(server, QByteArray("POST /widget-health/v1/report HTTP/1.1\r\n") + host +
				       "Origin: null\r\nContent-Type: application/json\r\nX-Widget-Health-Token: " +
				       token + "\r\nContent-Length: 9000\r\n\r\n")
		      .startsWith("HTTP/1.1 413"));
	server.stop();
	check(!QFile::exists(dir.path() + "/runtime-session/health.js"));
}
