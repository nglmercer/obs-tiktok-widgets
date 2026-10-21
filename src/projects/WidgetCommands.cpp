#include "WidgetCommands.hpp"
#include "WidgetBuilder.hpp"
#include <QDir>
#include <QFileInfo>
#include <QProcess>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QUrl>
#include <QUrlQuery>
#include <QRegularExpression>
namespace tt {
QStringList WidgetCommands::methods()
{
	return {"widgets.portable.get", "widgets.portable.set",  "studio.start",
		"builders.status",      "builders.install",      "doctor",
		"templates.list",       "templates.inspect",     "templates.install",
		"templates.export",     "templates.create",      "widgets.list",
		"widgets.create",       "widgets.show",          "widgets.project.get",
		"widgets.project.set",  "widgets.fork",          "widgets.duplicate",
		"widgets.delete",       "widgets.settings.get",  "widgets.settings.set",
		"widgets.files.list",   "widgets.files.read",    "widgets.files.write",
		"widgets.files.rename", "widgets.files.remove",  "widgets.files.mkdir",
		"widgets.files.format", "widgets.assets.import", "widgets.validate",
		"widgets.build",        "widgets.publish",       "widgets.preview",
		"widgets.history",      "widgets.snapshot",      "widgets.rollback",
		"widgets.export",       "widgets.import",        "migration.report",
		"migration.apply",      "migration.rollback",    "obs.status",
		"obs.scenes.list",      "obs.sources.list",      "obs.sources.add",
		"obs.sources.refresh",  "obs.sources.remove",    "obs.sources.capture",
		"obs.scenes.select",    "obs.shutdown"};
}
QJsonValue WidgetCommands::execute(const QString &method, const QJsonObject &a)
{
	if (!methods().contains(method))
		throw DomainError("UNKNOWN_METHOD", "Unknown command: " + method);
	const auto id = a["id"].toString(), revision = a["ifRevision"].toString();
	const bool dry = a["dryRun"].toBool();
	if (method.startsWith("obs.")) {
		if (dry)
			return QJsonObject{{"dryRun", true}, {"method", method}};
		if (!obs)
			throw DomainError("OBS_OFFLINE", "OBS local IPC is unavailable or disabled");
		return obs(method, a);
	}
	if (method == "builders.status")
		return builderStatus(service.directory());
	if (method == "builders.install")
		throw DomainError(
			"DEVELOPMENT_ONLY",
			"Framework toolchains are no longer installed for users. Use plain HTML/CSS/JavaScript projects; built-in widgets require no Node.js.");
	if (method == "doctor")
		return QJsonObject{{"config", service.directory()},
				   {"assets", service.assetDirectory()},
				   {"templates", service.templates.list().size()},
				   {"diagnostics", service.templates.diagnostics},
				   {"nodeSyntaxValidation", !QStandardPaths::findExecutable("node").isEmpty()},
				   {"apiMethods", QJsonArray::fromStringList(methods())},
				   {"runtimeNodeRequired", false}};
	if (method == "templates.list")
		return service.templates.list();
	if (method == "templates.inspect")
		return service.templates.resolve(a["template"].toString(), a["version"].toString()).value;
	TemplatePackageManager packages(service.directory(), service.templates);
	if (method == "templates.install")
		return packages.install(a["path"].toString(), dry);
	if (method == "templates.export") {
		if (!dry)
			packages.exportPackage(service.templates.resolve(a["template"].toString(),
									 a["version"].toString()),
					       a["output"].toString());
		return QJsonObject{{"output", a["output"]}, {"dryRun", dry}};
	}
	if (method == "templates.create") {
		if (dry)
			return QJsonObject{{"dryRun", true}, {"template", a["template"]}};
		return packages.create(a["template"].toString(), service.templates.resolve(a["from"].toString()));
	}
	if (method == "widgets.project.get")
		return service.get(id);
	if (method == "widgets.portable.get") {
		const auto value = service.portable(id);
		if (!a["output"].toString().isEmpty() && !dry)
			writeObject(a["output"].toString(), value);
		return value;
	}
	if (method == "widgets.portable.set")
		return dry ? QJsonValue(QJsonObject{{"dryRun", true}})
			   : QJsonValue(service.setPortable(id,
							    a.contains("project")
								    ? a["project"].toObject()
								    : readObject(a["fromFile"].toString()),
							    revision));
	if (method == "widgets.project.set") {
		if (dry)
			return QJsonObject{{"dryRun", true}, {"patch", a["settings"]}};
		return service.configure(id, a["settings"].toObject(), revision);
	}
	if (method == "widgets.list")
		return service.list();
	if (method == "widgets.show")
		return service.get(id);
	if (method == "widgets.files.list")
		return QJsonArray::fromStringList(service.files(id));
	if (method == "widgets.files.read") {
		const auto before = service.get(id)["revision"].toString();
		const auto text = QString::fromUtf8(service.read(id, a["file"].toString()));
		const auto after = service.get(id)["revision"].toString();
		if (before != after)
			throw DomainError("REVISION_CONFLICT",
					  "Source changed while reading; retry without replacing the draft",
					  {{"current", after}});
		return QJsonObject{{"path", a["file"]}, {"text", text}, {"revision", after}};
	}
	if (method == "widgets.settings.get") {
		const auto m = service.get(id);
		return QJsonObject{{"settings", m["settings"]}, {"revision", m["revision"]}};
	}
	if (method == "widgets.validate")
		return service.validate(id);
	if (method == "widgets.snapshot")
		return service.checkpoint(id, revision);
	if (method == "widgets.history")
		return service.history(id);
	if (method == "migration.report" || method == "migration.apply") {
		QJsonArray legacy;
		if (QFileInfo::exists(service.directory() + "/widgets.json"))
			legacy = QJsonDocument::fromJson(readFile(service.directory() + "/widgets.json")).array();
		return service.migration(legacy, method == "migration.report" || dry);
	}
	if (method == "migration.rollback")
		return service.restoreMigration(dry);
	if (dry) {
		if (!id.isEmpty())
			service.get(id);
		return QJsonObject{{"dryRun", true}, {"method", method}, {"id", id}};
	}
	if (method == "widgets.create")
		return service.create(a["template"].toString(), a["name"].toString(), a["version"].toString());
	if (method == "widgets.duplicate" || method == "widgets.fork")
		return service.duplicate(id, revision);
	if (method == "widgets.delete") {
		if (!a["confirm"].toBool())
			throw DomainError("CONFIRM_REQUIRED",
					  "Deletion requires --confirm; source/history are retained");
		return service.erase(id, revision);
	}
	if (method == "widgets.settings.set")
		return service.settings(id, a["settings"].toObject(), revision);
	if (method == "widgets.files.write")
		return service.write(id, a["file"].toString(),
				     a.contains("text") ? a["text"].toString().toUtf8()
							: readFile(a["fromFile"].toString()),
				     revision);
	for (const auto &op : {"rename", "remove", "mkdir"})
		if (method == "widgets.files." + QString(op))
			return service.fileOperation(id, op, a["file"].toString(), a["to"].toString(), revision);
	if (method == "widgets.assets.import")
		return service.importAsset(id, a["path"].toString(), a["as"].toString(), revision);
	if (method == "widgets.build" || method == "widgets.publish")
		return service.build(id, revision, method == "widgets.publish");
	if (method == "widgets.preview") {
		if (a.contains("count")) {
			const auto count = a["count"].toString();
			bool ok = false;
			count.toULongLong(&ok);
			if (!ok || !QRegularExpression("^[0-9]+$").match(count).hasMatch())
				throw DomainError("INVALID_INPUT", "Count must be a uint64 decimal string");
		}
		if (a.contains("event") &&
		    !QStringList{"gift", "chat", "like", "follow", "roomUser"}.contains(a["event"].toString()))
			throw DomainError("INVALID_INPUT", "Unsupported preview event type");
		for (const auto &key : {"user", "gift"})
			if (a[key].toString().size() > 512)
				throw DomainError("RESOURCE_LIMIT", "Preview text is too long");
		auto url = QUrl::fromLocalFile(service.preview(id));
		QUrlQuery query;
		for (const auto &key : {"event", "user", "gift", "count"})
			if (a.contains(key))
				query.addQueryItem(key, a[key].toString());
		url.setQuery(query);
		return QJsonObject{{"url", url.toString()}, {"isolated", true}};
	}
	if (method == "widgets.rollback")
		return service.rollback(id, a["revision"].toString(), revision);
	if (method == "widgets.export") {
		service.exportProject(id, a["output"].toString());
		return QJsonObject{{"output", a["output"]}};
	}
	if (method == "widgets.import")
		return service.importProject(a["path"].toString());
	if (method == "widgets.files.format") {
		const auto file = a["file"].toString();
		if (!file.startsWith("src/"))
			throw DomainError("UNSAFE_PATH", "Formatting is restricted to src/");
		const auto original = service.read(id, file);
		const auto expected = revision.isEmpty() ? service.get(id)["revision"].toString() : revision;
		auto formatter = QStandardPaths::findExecutable("prettier");
		QStringList formatterArgs{"--stdin-filepath", file};
#ifdef Q_OS_WIN
		// npm's Windows launcher is a batch file, not a QProcess executable.
		// Invoke its installed JS entry directly without a shell or command interpolation.
		const auto entry = QFileInfo(formatter).absolutePath() + "/../prettier/bin/prettier.cjs";
		if (!formatter.isEmpty() && QFileInfo::exists(entry)) {
			formatter = QStandardPaths::findExecutable("node");
			formatterArgs.prepend(entry);
		}
#endif
		if (formatter.isEmpty())
			throw DomainError("FORMATTER_UNAVAILABLE",
					  "Install Prettier for opt-in formatting; builds never format source");
		QProcess process;
		process.start(formatter, formatterArgs);
		if (!process.waitForStarted())
			throw DomainError("FORMATTER_UNAVAILABLE", "Cannot launch formatter");
		process.write(original);
		process.closeWriteChannel();
		if (!process.waitForFinished(10000)) {
			process.kill();
			process.waitForFinished();
			throw DomainError("FORMAT_TIMEOUT", "Formatter timed out");
		}
		if (process.exitCode() != 0)
			throw DomainError("FORMAT_ERROR", QString::fromUtf8(process.readAllStandardError()));
		const auto formatted = process.readAllStandardOutput();
		if (a["check"].toBool()) {
			if (original != formatted)
				throw DomainError("FORMAT_DIFFERENCE", "File requires formatting");
			return QJsonObject{{"formatted", true}, {"changed", false}};
		}
		return service.write(id, file, formatted, expected);
	}
	throw DomainError("UNKNOWN_METHOD", "Unimplemented command");
}
} // namespace tt
