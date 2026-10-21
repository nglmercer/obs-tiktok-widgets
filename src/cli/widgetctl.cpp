#include "projects/WidgetCommands.hpp"
#include <QCoreApplication>
#include <QJsonDocument>
#include <QStandardPaths>
#include <QDir>
#include <QFileInfo>
#include <QLocalSocket>
#include <QTextStream>
#include <QProcess>
using namespace tt;
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	app.setApplicationName("widgetctl");
	QTextStream out(stdout);
	try {
		const auto args = app.arguments().mid(1);
		if (!args.isEmpty() && args.first() == "--version" &&
		    (args.size() == 1 || (args.size() == 2 && args.last() == "--json"))) {
			if (args.contains("--json"))
				out << QJsonDocument(success(QJsonObject{{"version", "3.0.0"}, {"apiVersion", 1}}))
						.toJson(QJsonDocument::Compact)
				    << "\n";
			else
				out << "widgetctl 3.0.0 API 1\n";
			return 0;
		}
		if (args.isEmpty() || args.contains("--help")) {
			if (args.contains("--json")) {
				out << QJsonDocument(
					       success(QJsonObject{
						       {"methods",
							QJsonArray::fromStringList(WidgetCommands::methods())},
						       {"usage",
							"widgetctl [--config DIR] [--assets DIR] COMMAND [--json]"}}))
						.toJson(QJsonDocument::Compact)
				    << "\n";
				return 0;
			}
			out << "widgetctl [--config DIR] [--assets DIR] COMMAND [--json] [--dry-run]\n"
			    << "Mutations support --if-revision TOKEN. Delete requires --confirm.\n"
			    << WidgetCommands::methods().join('\n') << "\n";
			return 0;
		}
		QStringList words;
		QJsonObject request;
		QString config = QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) +
				 "/obs-studio/plugin_config/obs-tiktok-widgets",
			assets = QCoreApplication::applicationDirPath() +
				 "/../share/obs/obs-plugins/obs-tiktok-widgets/web";
		if (QFileInfo::exists(QCoreApplication::applicationDirPath() + "/../../data/web/templates"))
			assets = QCoreApplication::applicationDirPath() + "/../../data/web";
		for (const auto &candidate :
		     QStringList{QCoreApplication::applicationDirPath() + "/../obs-tiktok-widgets/data/web",
				 QCoreApplication::applicationDirPath() +
					 "/../obs-tiktok-widgets.plugin/Contents/Resources/web"})
			if (QFileInfo::exists(candidate + "/templates"))
				assets = candidate;
#ifdef Q_OS_WIN
		if (!qEnvironmentVariable("APPDATA").isEmpty())
			config = qEnvironmentVariable("APPDATA") + "/obs-studio/plugin_config/obs-tiktok-widgets";
#elif defined(Q_OS_MACOS)
		config = QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation) +
			 "/obs-studio/plugin_config/obs-tiktok-widgets";
#endif
		QJsonObject settings;
		const QMap<QString, QString> keys{{"--template", "template"},
						  {"--name", "name"},
						  {"--version", "version"},
						  {"--if-revision", "ifRevision"},
						  {"--revision", "revision"},
						  {"--from-file", "fromFile"},
						  {"--output", "output"},
						  {"--from", "from"},
						  {"--as", "as"},
						  {"--scene", "scene"},
						  {"--event", "event"},
						  {"--user", "user"},
						  {"--gift", "gift"},
						  {"--count", "count"},
						  {"--to", "to"}};
		for (int i = 0; i < args.size(); ++i) {
			const auto arg = args[i];
			if (arg == "--json")
				continue;
			if (arg == "--dry-run") {
				request["dryRun"] = true;
				continue;
			}
			if (arg == "--confirm" || arg == "--noninteractive") {
				request["confirm"] = true;
				continue;
			}
			if (arg == "--check") {
				request["check"] = true;
				continue;
			}
			if (arg.startsWith("--")) {
				if (++i >= args.size())
					throw DomainError("USAGE", "Missing option value");
				const auto value = args[i];
				if (arg == "--config" || arg == "--profile")
					config = QFileInfo(value).absoluteFilePath();
				else if (arg == "--assets")
					assets = QFileInfo(value).absoluteFilePath();
				else if (arg == "--set") {
					const auto eq = value.indexOf('=');
					if (eq < 1)
						throw DomainError("USAGE", "--set requires key=value");
					const auto raw = value.mid(eq + 1);
					auto parsed = QJsonDocument::fromJson(("[" + raw + "]").toUtf8());
					settings[value.left(eq)] = parsed.isArray() && !parsed.array().isEmpty()
									   ? parsed.array().first()
									   : QJsonValue(raw);
				} else if (keys.contains(arg))
					request[keys[arg]] = value;
				else
					throw DomainError("USAGE", "Unknown option: " + arg);
			} else
				words << arg;
		}
		QString method;
		if (words.isEmpty())
			throw DomainError("USAGE", "Command required");
		method = words.takeFirst();
		if (QStringList{"templates", "widgets", "obs", "migration", "builders", "studio"}.contains(method)) {
			if (words.isEmpty())
				throw DomainError("USAGE", "Subcommand required");
			method += '.' + words.takeFirst();
			if (method == "widgets.portable" || method == "widgets.files" || method == "widgets.project" ||
			    method == "widgets.settings" || method == "widgets.assets" || method == "obs.sources" ||
			    method == "obs.scenes") {
				if (words.isEmpty())
					throw DomainError("USAGE", "Operation required");
				method += '.' + words.takeFirst();
			}
		}
		if (method.startsWith("templates.")) {
			if (!words.isEmpty())
				request[method == "templates.install" ? "path" : "template"] = words.takeFirst();
		} else if (method == "widgets.import") {
			if (!words.isEmpty())
				request["path"] = words.takeFirst();
		} else if (method.startsWith("widgets.") || method.startsWith("obs.sources.")) {
			if (!words.isEmpty())
				request["id"] = words.takeFirst();
			if (!words.isEmpty())
				request[method == "widgets.assets.import" ? "path" : "file"] = words.takeFirst();
		}
		if (!words.isEmpty())
			throw DomainError("USAGE", "Unexpected positional argument");
		request["settings"] = settings;
		if (method == "studio.start") {
			if (!request["confirm"].toBool())
				throw DomainError(
					"CONSENT_REQUIRED",
					"Studio starts an authenticated loopback service; --confirm required");
			QProcess process;
			process.setProcessChannelMode(QProcess::ForwardedChannels);
			process.start(QCoreApplication::applicationDirPath() + "/widgetstudio",
				      {"--confirm", "--config", config, "--assets", assets});
			if (!process.waitForStarted())
				throw DomainError("STUDIO_START", "widgetstudio executable missing");
			process.waitForFinished(-1);
			return process.exitCode();
		}
		if (method.startsWith("obs.") || method == "widgets.health") {
			const auto statePath = safePath(config, "cache/ipc.json");
			if (!QFileInfo::exists(statePath))
				throw DomainError("OBS_OFFLINE", "OBS IPC is disabled or not running");
			const auto state = readObject(statePath);
			QLocalSocket socket;
			socket.connectToServer(state["socket"].toString());
			if (!socket.waitForConnected(2000))
				throw DomainError("OBS_OFFLINE", "OBS IPC is not running");
			const auto packet = QJsonDocument(QJsonObject{{"apiVersion", 1},
								      {"token", state["token"]},
								      {"method", method},
								      {"args", request}})
						    .toJson(QJsonDocument::Compact) +
					    '\n';
			socket.write(packet);
			socket.waitForBytesWritten(2000);
			QByteArray response;
			while (!response.contains('\n')) {
				if (!socket.waitForReadyRead(3000))
					throw DomainError("IPC_TIMEOUT", "OBS request timed out");
				response += socket.readAll();
				if (response.size() > 1024 * 1024)
					throw DomainError("RESOURCE_LIMIT", "IPC response too large");
			}
			const auto result = QJsonDocument::fromJson(response).object();
			out << QJsonDocument(result).toJson(QJsonDocument::Compact) << "\n";
			return result["ok"].toBool() ? 0 : 4;
		}
		WidgetProjectService service(config, assets);
		WidgetCommands commands(service);
		const auto result = commands.execute(method, request);
		if (method == "widgets.files.read" && !args.contains("--json"))
			out << result.toObject()["text"].toString();
		else
			out << QJsonDocument(success(result)).toJson(QJsonDocument::Compact) << "\n";
		return 0;
	} catch (const DomainError &e) {
		out << QJsonDocument(failure(e)).toJson(QJsonDocument::Compact) << "\n";
		return e.code == "REVISION_CONFLICT" ? 3 : e.code == "USAGE" ? 2 : 4;
	} catch (const std::exception &e) {
		out << QJsonDocument(failure(DomainError("INTERNAL_ERROR", QString::fromUtf8(e.what()))))
				.toJson(QJsonDocument::Compact)
		    << "\n";
		return 5;
	}
}
