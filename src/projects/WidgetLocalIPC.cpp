#include "WidgetLocalIPC.hpp"
#include <QLocalSocket>
#include <QTimer>
#include <QFile>
#include <QJsonDocument>
#include <QDateTime>
#include <QCryptographicHash>
#include <QUuid>
#include <QDir>
#include <QCoreApplication>
#include <memory>
namespace tt {
WidgetLocalIPC::WidgetLocalIPC(WidgetCommands &c, QString r, QObject *p) : QObject(p), commands(c), root(std::move(r))
{
}
WidgetLocalIPC::~WidgetLocalIPC()
{
	stop();
}
bool WidgetLocalIPC::start(bool enabled)
{
	if (!enabled)
		return false;
	const auto dir = safePath(root, "cache");
	QDir().mkpath(dir);
	QFile::setPermissions(dir, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
	const auto socket =
		QDir::tempPath() + "/obs-widgetctl-" +
		QString::fromLatin1(
			QCryptographicHash::hash(root.toUtf8(), QCryptographicHash::Sha256).toHex().left(16)) +
		"-" + QString::number(QCoreApplication::applicationPid());
	token = QUuid::createUuid().toString(QUuid::WithoutBraces) + QUuid::createUuid().toString(QUuid::WithoutBraces);
	server.setMaxPendingConnections(8);
	server.setSocketOptions(QLocalServer::UserAccessOption);
	if (!server.listen(socket))
		throw DomainError("IPC_LISTEN", server.errorString());
	writeObject(dir + "/ipc.json", {{"apiVersion", 1}, {"socket", socket}, {"token", token}});
	QFile::setPermissions(dir + "/ipc.json", QFileDevice::ReadOwner | QFileDevice::WriteOwner);
	connect(&server, &QLocalServer::newConnection, this, [this] {
		while (server.hasPendingConnections()) {
			auto *s = server.nextPendingConnection();
			if (server.findChildren<QLocalSocket *>().size() > 16) {
				s->abort();
				s->deleteLater();
				continue;
			}
			auto buffer = std::make_shared<QByteArray>();
			auto *t = new QTimer(s);
			t->setSingleShot(true);
			t->start(3000);
			connect(t, &QTimer::timeout, s, &QLocalSocket::abort);
			connect(s, &QLocalSocket::disconnected, s, &QObject::deleteLater);
			const auto receive = [this, s, buffer, t] {
				if (s->property("handled").toBool())
					return;
				*buffer += s->readAll();
				if (buffer->size() > 65536) {
					s->abort();
					return;
				}
				if (!buffer->contains('\n'))
					return;
				s->setProperty("handled", true);
				t->stop();
				QJsonObject response;
				QString method;
				try {
					QJsonParseError error;
					const auto doc =
						QJsonDocument::fromJson(buffer->left(buffer->indexOf('\n')), &error);
					const auto p = doc.object();
					if (error.error != QJsonParseError::NoError || !doc.isObject() ||
					    p["apiVersion"].toInt() != 1 || !p["args"].isObject())
						throw DomainError("INVALID_REQUEST", "Invalid IPC envelope");
					if (QCryptographicHash::hash(p["token"].toString().toUtf8(),
								     QCryptographicHash::Sha256) !=
					    QCryptographicHash::hash(token.toUtf8(), QCryptographicHash::Sha256))
						throw DomainError("UNAUTHORIZED", "IPC authentication failed");
					const auto now = QDateTime::currentMSecsSinceEpoch();
					if (now - interval > 1000) {
						interval = now;
						count = 0;
					}
					if (++count > 20)
						throw DomainError("RATE_LIMIT", "Too many IPC requests");
					method = p["method"].toString();
					if (!method.startsWith("obs."))
						throw DomainError(
							"METHOD_DENIED",
							"Only OBS placement operations are exposed over live IPC; author edits use the locked offline service");
					response = success(commands.execute(method, p["args"].toObject()));
				} catch (const DomainError &e) {
					response = failure(e);
				} catch (const std::exception &e) {
					response = failure(DomainError("INTERNAL_ERROR", QString::fromUtf8(e.what())));
				}
				QFile audit(safePath(root, "cache/ipc-audit.jsonl"));
				if (audit.size() > 1024 * 1024) {
					audit.remove();
				}
				if (audit.open(QIODevice::WriteOnly | QIODevice::Append)) {
					const auto line =
						QJsonDocument(
							QJsonObject{
								{"time",
								 QString::number(QDateTime::currentMSecsSinceEpoch())},
								{"method", method},
								{"ok", response["ok"]}})
							.toJson(QJsonDocument::Compact) +
						'\n';
					audit.write(line);
				}
				s->write(QJsonDocument(response).toJson(QJsonDocument::Compact) + '\n');
				s->disconnectFromServer();
			};
			connect(s, &QLocalSocket::readyRead, this, receive);
			if (s->bytesAvailable() > 0)
				QTimer::singleShot(0, s, receive);
		}
	});
	return true;
}
void WidgetLocalIPC::stop()
{
	if (server.isListening()) {
		server.close();
		QFile::remove(safePath(root, "cache/ipc.json"));
	}
	token.clear();
}
} // namespace tt
