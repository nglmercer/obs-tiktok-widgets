#include "WidgetManager.hpp"
#include <QFileInfo>
#include <QJsonDocument>
#include <QDir>
namespace tt {
WidgetManager::WidgetManager(QString d, QString a)
	: directory(std::move(d)),
	  assets(std::move(a)),
	  projects(directory, assets)
{
	load();
	for (const auto &w : widgets)
		try {
			materialize(w);
		} catch (const std::exception &e) {
			restorationError = QString::fromUtf8(e.what());
		}
}
void WidgetManager::load()
{
	widgets.clear();
	const auto reg = projects.registry();
	if (reg["migrationRolledBack"].toBool() && QFileInfo::exists(directory + "/widgets.json")) {
		const auto legacy = QJsonDocument::fromJson(readFile(directory + "/widgets.json")).array();
		for (const auto &v : legacy)
			widgets.append({v.toObject()});
		return;
	}
	if (!reg.contains("migrationVersion") && QFileInfo::exists(directory + "/widgets.json")) {
		QJsonParseError error;
		const auto doc = QJsonDocument::fromJson(readFile(directory + "/widgets.json"), &error);
		if (error.error != QJsonParseError::NoError || !doc.isArray())
			throw DomainError("INVALID_JSON", "Legacy widgets.json is invalid; original preserved");
		projects.migration(doc.array(), false);
	}
	for (const auto &v : projects.list()) {
		const auto o = v.toObject();
		if (o.contains("settings") && !o.contains("diagnostic"))
			widgets.append({o["settings"].toObject()});
	}
	// Preserve unresolved legacy records in the gallery with diagnostics instead of dropping them.
	for (const auto &v : projects.registry()["legacyRecords"].toArray()) {
		const auto o = v.toObject();
		bool exists = false;
		for (const auto &w : widgets)
			if (w.id() == o["id"].toString())
				exists = true;
		if (!exists) {
			bool deleted = false;
			for (const auto &r : projects.registry()["widgets"].toArray())
				if (r.toObject()["id"] == o["id"] && r.toObject()["deleted"].toBool())
					deleted = true;
			if (!deleted)
				widgets.append({o});
		}
	}
}
void WidgetManager::ensureProject(const WidgetConfig &w) const
{
	validateUuid(w.id());
	if (!QFileInfo::exists(projects.projectPath(w.id()) + "/project.json")) {
		if (!w.value["customHtml"].toString().isEmpty() || !w.value["editableHtml"].toString().isEmpty() ||
		    QFileInfo::exists(projects.outputPath(w.id())))
			projects.migration(QJsonArray{w.value}, false);
		else
			projects.create(w.type(), w.name(), {}, w.id());
	}
}
void WidgetManager::save()
{
	for (const auto &w : widgets) {
		ensureProject(w);
		auto current = projects.get(w.id());
		auto patch = w.value;
		for (const auto &key : {"id", "template", "customHtml", "editableHtml"})
			patch.remove(key);
		auto settings = current["settings"].toObject();
		for (const auto &key : {"id", "template", "customHtml", "editableHtml"})
			settings.remove(key);
		if (settings != patch)
			projects.settings(w.id(), patch, current["revision"].toString());
	}
}
QString WidgetManager::materialize(const WidgetConfig &w) const
{
	const auto path = projects.outputPath(w.id());
	if (projects.registry()["migrationRolledBack"].toBool() && QFileInfo::exists(path))
		return path;
	ensureProject(w);
	if (!QFileInfo::exists(directory + "/runtime/" + w.id() + "/build-manifest.json")) {
		try {
			projects.build(w.id(), {}, true);
		} catch (...) {
			if (!QFileInfo::exists(path))
				throw;
		}
	}
	return path;
}
QString WidgetManager::materializePlayground(const WidgetConfig &w) const
{
	ensureProject(w);
	return projects.preview(w.id());
}
QJsonObject WidgetManager::publish(const QString &id, const QString &revision)
{
	return projects.build(id, revision, true);
}
WidgetConfig WidgetManager::create(QString type)
{
	QString version;
	if (type.startsWith("template:")) {
		type = type.mid(9);
		version = type.section('@', 1);
		type = type.section('@', 0, 0);
	}
	const auto metadata = projects.create(type, {}, version);
	WidgetConfig w{metadata["settings"].toObject()};
	widgets.append(w);
	return w;
}
WidgetConfig WidgetManager::duplicate(QString id)
{
	const auto m = projects.duplicate(id);
	WidgetConfig w{m["settings"].toObject()};
	widgets.append(w);
	return w;
}
void WidgetManager::erase(QString id)
{
	validateUuid(id);
	const auto preview = safePath(directory, "playground/" + id);
	projects.erase(id);
	for (auto it = widgets.begin(); it != widgets.end(); ++it)
		if (it->id() == id) {
			widgets.erase(it);
			break;
		}
	if (QFileInfo::exists(preview) && !QDir(preview).removeRecursively())
		throw DomainError("FILE_WRITE", "Cannot remove generated preview");
}
} // namespace tt
