#include <QSettings>
#include "StudioServer.hpp"
#include <QDir>
#include <QFileInfo>
#include <QTcpSocket>
#include <QTimer>
#include <QTemporaryDir>
#include <QLocalSocket>
#include <QJsonDocument>
#include <QUuid>
#include <QUrl>
#include <QMimeDatabase>
#include <QDateTime>
#include <QFile>
namespace tt {
StudioServer::StudioServer(WidgetProjectService &s, QString assets, QObject *parent)
	: QTcpServer(parent),
	  service(s),
	  commands(s),
	  assetRoot(assets)
{
	token = QUuid::createUuid().toString(QUuid::WithoutBraces) + QUuid::createUuid().toString(QUuid::WithoutBraces);
	allowed = {"widgets.portable.get",   "widgets.portable.set",
		   "studio.preferences.get", "studio.preferences.set",
		   "studio.package.import",  "studio.project.export",
		   "studio.asset.import",    "obs.status",
		   "obs.scenes.list",        "obs.sources.list",
		   "obs.sources.add",        "obs.sources.remove",
		   "obs.sources.refresh",    "doctor",
		   "builders.status",        "templates.list",
		   "templates.inspect",      "widgets.list",
		   "widgets.create",         "widgets.show",
		   "widgets.duplicate",      "widgets.delete",
		   "widgets.project.get",    "widgets.project.set",
		   "widgets.settings.get",   "widgets.settings.set",
		   "widgets.files.list",     "widgets.files.read",
		   "widgets.files.write",    "widgets.files.rename",
		   "widgets.files.remove",   "widgets.files.mkdir",
		   "widgets.validate",       "widgets.build",
		   "widgets.publish",        "widgets.preview",
		   "widgets.history",        "widgets.snapshot",
		   "widgets.rollback"};
	commands.obs = [this](const QString &method, const QJsonObject &args) -> QJsonValue {
		const auto path = safePath(service.directory(), "cache/ipc.json");
		if (!QFileInfo::exists(path))
			throw DomainError("OBS_OFFLINE", "OBS local IPC is disabled or offline");
		auto state = readObject(path);
		QLocalSocket socket;
		socket.connectToServer(state["socket"].toString());
		if (!socket.waitForConnected(1000))
			throw DomainError("OBS_OFFLINE", "OBS unavailable");
		socket.write(QJsonDocument(QJsonObject{{"apiVersion", 1},
						       {"token", state["token"]},
						       {"method", method},
						       {"args", args}})
				     .toJson(QJsonDocument::Compact) +
			     '\n');
		socket.waitForBytesWritten(1000);
		QByteArray data;
		while (!data.contains('\n')) {
			if (!socket.waitForReadyRead(3000))
				throw DomainError("IPC_TIMEOUT", "OBS timed out");
			data += socket.readAll();
			if (data.size() > 1024 * 1024)
				throw DomainError("RESOURCE_LIMIT", "OBS response too large");
		}
		auto result = QJsonDocument::fromJson(data).object();
		if (!result["ok"].toBool()) {
			auto e = result["error"].toObject();
			throw DomainError(e["code"].toString(), e["message"].toString());
		}
		return result["data"];
	};

	connect(this, &QTcpServer::newConnection, this, [this] {
		while (hasPendingConnections()) {
			auto *s = nextPendingConnection();
			if (children().size() > 48) {
				s->deleteLater();
				continue;
			}
			s->setProperty("buffer", QByteArray{});
			s->setProperty("count", 0);
			connect(s, &QTcpSocket::readyRead, this, [this, s] { receive(s); });
			connect(s, &QTcpSocket::disconnected, s, &QObject::deleteLater);
			QTimer::singleShot(5000, s, [s] { s->disconnectFromHost(); });
		}
	});
}
QString StudioServer::start()
{
	if (!listen(QHostAddress::LocalHost, 0))
		throw DomainError("STUDIO_START", errorString());
	origin = "http://127.0.0.1:" + QString::number(serverPort());
	return origin + "/#" + token;
}
void StudioServer::receive(QTcpSocket *socket)
{
	auto data = socket->property("buffer").toByteArray() + socket->readAll();
	socket->setProperty("buffer", data);
	auto reply = [socket](int code, QByteArray body, QByteArray type = "application/json", QByteArray extra = {}) {
		socket->write(
			"HTTP/1.1 " + QByteArray::number(code) +
			" Result\r\nConnection: close\r\nContent-Type: " + type +
			"\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Length: " +
			QByteArray::number(body.size()) + "\r\n" + extra + "\r\n" + body);
		socket->disconnectFromHost();
	};
	if (data.size() > 1024 * 1024 + 16384) {
		reply(413, "{}");
		return;
	}
	const int end = data.indexOf("\r\n\r\n");
	if (end < 0) {
		if (data.size() > 16384)
			reply(413, "{}");
		return;
	}
	const auto lines = data.left(end).split('\n');
	auto first = lines.first().trimmed().split(' ');
	if (first.size() != 3) {
		reply(400, "{}");
		return;
	}
	QMap<QByteArray, QByteArray> h;
	for (int i = 1; i < lines.size(); ++i) {
		auto l = lines[i].trimmed();
		auto colon = l.indexOf(':');
		if (colon > 0) {
			auto key = l.left(colon).toLower();
			if (h.contains(key)) {
				reply(400, "{}");
				return;
			}
			h[key] = l.mid(colon + 1).trimmed();
		}
	}
	bool ok = true;
	const auto length = h.contains("content-length") ? h["content-length"].toLongLong(&ok) : 0;
	if (!ok || length < 0 || length > 1024 * 1024 || h.contains("transfer-encoding")) {
		reply(400, "{}");
		return;
	}
	if (data.size() < end + 4 + length)
		return;
	if (socket->property("handled").toBool())
		return;
	socket->setProperty("handled", true);
	if (h["host"] != QUrl(origin).authority().toUtf8() ||
	    (!h["origin"].isEmpty() && h["origin"] != origin.toUtf8()) || h["sec-fetch-site"] == "cross-site") {
		reply(403, "{}");
		return;
	}
	const auto path = QUrl::fromPercentEncoding(first[1].split('?').first());
	const auto body = data.mid(end + 4, length);
	const auto cookieName = "widgetstudio_" + QByteArray::number(serverPort());
	bool auth = false;
	for (const auto &cookie : h["cookie"].split(';'))
		if (cookie.trimmed() == cookieName + "=" + token.toUtf8())
			auth = true;
	if (path == "/session" && first[0] == "POST") {
		if (h["origin"] != origin.toUtf8() || (body != token.toUtf8() && !(body.isEmpty() && auth))) {
			reply(403, "{}");
			return;
		}
		// Reload recovery requires the existing HttpOnly cookie and exact same origin.
		// The returned credential belongs only to Studio, never to OBS local IPC.
		reply(200, QJsonDocument(QJsonObject{{"ok", true}, {"session", token}}).toJson(QJsonDocument::Compact),
		      "application/json",
		      "Set-Cookie: " + cookieName + "=" + token.toUtf8() + "; HttpOnly; SameSite=Strict; Path=/\r\n");
		return;
	}
	if (path == "/api") {
		if (first[0] != "POST" || !auth || h["origin"] != origin.toUtf8() ||
		    h["x-studio-session"] != token.toUtf8()) {
			reply(403, "{}");
			return;
		}
		static qint64 epoch = 0;
		static int count = 0;
		auto now = QDateTime::currentSecsSinceEpoch();
		if (epoch != now) {
			epoch = now;
			count = 0;
		}
		if (++count > 30) {
			reply(429, "{}");
			return;
		}
		try {
			QJsonParseError error;
			auto packet = QJsonDocument::fromJson(body, &error).object();
			if (error.error != QJsonParseError::NoError)
				throw DomainError("INVALID_JSON", "Invalid request");
			auto method = packet["method"].toString();
			auto args = packet["args"].toObject();
			if ((method == "obs.sources.add" || method == "obs.sources.remove") &&
			    !args["confirm"].toBool())
				throw DomainError("CONFIRM_REQUIRED", "Scene changes require explicit confirmation");
			if (QStringList{"widgets.settings.set", "widgets.project.set", "widgets.delete",
					"widgets.duplicate", "widgets.files.rename", "widgets.files.remove",
					"widgets.files.mkdir", "widgets.rollback", "widgets.publish", "widgets.build",
					"widgets.snapshot"}
				    .contains(method) &&
			    args["ifRevision"].toString().isEmpty())
				throw DomainError("REVISION_REQUIRED", "Mutations require the current revision");
			if (!allowed.contains(method))
				throw DomainError("FORBIDDEN_METHOD", "Method is not allowed in Studio");
			if (method == "widgets.preview" &&
			    !QFileInfo::exists(safePath(service.directory(),
							"runtime/" + args["id"].toString() + "/build-manifest.json")))
				throw DomainError(
					"NOT_PUBLISHED",
					"Publish a validated build before opening the production-equivalent preview");
			QJsonValue result;
			if (method == "studio.preferences.get" || method == "studio.preferences.set") {
				QSettings preferences(service.directory() + "/ui-preferences.ini",
						      QSettings::IniFormat);
				if (method == "studio.preferences.set") {
					const auto locale = args["locale"].toString(), theme = args["theme"].toString();
					if (!QStringList{"en", "es"}.contains(locale) ||
					    !QStringList{"dark", "light", "system"}.contains(theme))
						throw DomainError("INVALID_PREFERENCE", "Invalid language or theme");
					preferences.setValue("locale", locale);
					preferences.setValue("theme", theme);
					preferences.sync();
					if (preferences.status() != QSettings::NoError)
						throw DomainError("FILE_WRITE", "Cannot save UI preferences");
				}
				result = QJsonObject{{"locale", preferences.value("locale").toString()},
						     {"theme", preferences.value("theme").toString()}};
			} else if (method == "studio.package.import") {
				QTemporaryDir temp(safePath(service.directory(), "cache") + "-studio-import-XXXXXX");
				auto path = temp.path() + "/upload.tiktokwidget";
				auto bytes = QByteArray::fromBase64(args["base64"].toString().toUtf8());
				if (bytes.isEmpty())
					throw DomainError("INVALID_PACKAGE", "Empty package");
				atomicWrite(path, bytes);
				if (args["kind"] == "template") {
					TemplatePackageManager manager(service.directory(), service.templates);
					result = manager.install(path, !args["confirm"].toBool());
				} else
					result = service.importProject(path, !args["confirm"].toBool());
			} else if (method == "studio.project.export") {
				QTemporaryDir temp;
				auto path = temp.path() + "/project.tiktokwidget";
				service.exportProject(args["id"].toString(), path);
				result = QJsonObject{{"base64", QString::fromLatin1(readFile(path).toBase64())}};
			} else if (method == "studio.asset.import") {
				const auto file = args["file"].toString();
				if (!file.startsWith("assets/") || args["ifRevision"].toString().isEmpty())
					throw DomainError("UNSAFE_PATH",
							  "Assets import requires a project asset path and revision");
				result = service.write(args["id"].toString(), file,
						       QByteArray::fromBase64(args["base64"].toString().toUtf8()),
						       args["ifRevision"].toString());
			} else if (method == "widgets.files.write") {
				auto file = args["file"].toString();
				if (!file.startsWith("src/") ||
				    !QStringList{"html", "css", "js", "mjs", "ts", "tsx", "json", "svg"}.contains(
					    QFileInfo(file).suffix()))
					throw DomainError("UNSAFE_PATH", "Studio edits supported source files only");
				if (args["ifRevision"].toString().isEmpty())
					throw DomainError("REVISION_REQUIRED", "Source writes require a revision");
				result = service.write(args["id"].toString(), file, args["text"].toString().toUtf8(),
						       args["ifRevision"].toString());
			} else
				result = commands.execute(method, args);
			if (method == "widgets.preview") {
				auto url = QUrl(result.toObject()["url"].toString());
				auto obj = result.toObject();
				auto relative = QDir(service.directory()).relativeFilePath(url.toLocalFile());
				obj["url"] = "/project/" + relative + "?" + url.query();
				result = obj;
			}
			reply(200, publicConfig(success(result)));
			if (!method.endsWith(".list") && !method.endsWith(".get") && !method.endsWith(".read")) {
				QFile audit(safePath(service.directory(), "cache/studio-audit.jsonl"));
				QDir().mkpath(QFileInfo(audit).path());
				if (audit.size() > 1024 * 1024)
					(void)audit.open(QIODevice::WriteOnly | QIODevice::Truncate);
				else
					(void)audit.open(QIODevice::WriteOnly | QIODevice::Append);
				audit.write(QJsonDocument(QJsonObject{{"method", method},
								      {"time", QDateTime::currentDateTimeUtc().toString(
										       Qt::ISODate)}})
						    .toJson(QJsonDocument::Compact) +
					    "\n");
			}
		} catch (const DomainError &e) {
			reply(400, QJsonDocument(failure(e)).toJson(QJsonDocument::Compact));
		}
		return;
	}
	if (first[0] != "GET") {
		reply(405, "{}");
		return;
	}
	try {
		QString file;
		if (path.startsWith("/template/")) {
			if (!auth)
				throw DomainError("UNAUTHORIZED", "Session required");
			auto parts = path.mid(10).split('/');
			if (parts.size() < 3)
				throw DomainError("UNSAFE_PATH", "Template identity required");
			auto manifest = service.templates.resolve(parts[0], parts[1]);
			file = safePath(manifest.root, parts.mid(2).join('/'));
		} else if (path.startsWith("/project/")) {
			if (!auth)
				throw DomainError("UNAUTHORIZED", "Session required");
			auto rel = path.mid(9);
			const auto parts = rel.split('/');
			if (parts.size() < 3 || !QStringList{"widgets", "runtime", "playground"}.contains(parts[0]))
				throw DomainError("UNSAFE_PATH", "Generated preview only");
			validateUuid(parts[1]);
			if (parts.contains("cache") || parts.contains(".history") ||
			    parts.last() == "runtime-config.json")
				throw DomainError("UNSAFE_PATH", "Private artifacts are not served");
			file = safePath(service.directory(), rel);
		} else if (path.startsWith("/playground/") || path.startsWith("/sdk/")) {
			if (!auth)
				throw DomainError("UNAUTHORIZED", "Session required");
			file = safePath(assetRoot, path.mid(1));
		} else {
			file = safePath(assetRoot + "/studio", path == "/" ? "index.html" : path.mid(1));
		}
		auto content = readFile(file);
		reply(200, content, QMimeDatabase().mimeTypeForFile(file).name().toUtf8(),
		      path == "/"
			      ? "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; frame-ancestors 'none'\r\n"
			      : "");
	} catch (const DomainError &e) {
		reply(404, QJsonDocument(failure(e)).toJson(QJsonDocument::Compact));
	}
}
} // namespace tt
