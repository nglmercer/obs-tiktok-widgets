#include "CompositionService.hpp"
#include "universal/SchemaValidator.hpp"
#include <QSet>
#include <QUuid>
namespace tt {
void validateCompositionDocument(const QJsonObject &document, const QJsonObject &schema)
{
	if (QJsonDocument(document).toJson(QJsonDocument::Compact).size() > 512 * 1024 ||
	    !uw::validate(schema, document, schema))
		throw DomainError("COMPOSITION_INVALID", "Composition does not match its versioned schema");
	QSet<QString> ids;
	for (const auto &value : document["widgets"].toArray()) {
		const auto widget = value.toObject();
		const auto widgetId = widget["id"].toString();
		if (ids.contains(widgetId))
			throw DomainError("COMPOSITION_INVALID", "Duplicate widget identity");
		ids.insert(widgetId);
		const auto ref = widget["template"].toObject();
		// Only exact versions implemented by the shared renderer are accepted.
		if (ref["version"] != "2.0.0" ||
		    !QStringList{"builtin.chat", "builtin.gift-alert", "builtin.follow-alert", "builtin.likes",
				 "builtin.viewers", "builtin.events", "builtin.custom"}
			     .contains(ref["id"].toString()))
			throw DomainError("TEMPLATE_VERSION_UNAVAILABLE",
					  "Composition template runtime is unavailable");
	}
}

QJsonObject CompositionService::project(const QString &id) const
{
	const auto value = projects.get(id);
	if (value["template"].toObject()["id"] != "builtin.composition")
		throw DomainError("NOT_COMPOSITION", "Project is not a composition");
	return value;
}
void CompositionService::requireRevision(const QString &id, const QString &revision) const
{
	if (revision.isEmpty())
		throw DomainError("REVISION_REQUIRED", "Composition mutations require ifRevision");
	if (project(id)["revision"] != revision)
		throw DomainError("REVISION_CONFLICT", "Composition changed; reread before applying edits");
}
QJsonValue CompositionService::execute(const QString &method, const QJsonObject &args)
{
	const auto id = args["id"].toString(), revision = args["ifRevision"].toString();
	if (method == "compositions.list") {
		QJsonArray result;
		for (const auto &value : projects.list())
			if (value.toObject()["template"].toObject()["id"] == "builtin.composition")
				result.append(value);
		return result;
	}
	if (method == "compositions.create")
		return projects.create("builtin.composition", args["name"].toString(), "1.0.0");
	const auto current = project(id);
	if (method == "compositions.get")
		return current;
	if (method == "compositions.history")
		return projects.history(id);
	requireRevision(id, revision);
	if (method == "compositions.duplicate")
		return projects.duplicate(id, revision);
	if (method == "compositions.remove") {
		if (!args["confirm"].toBool())
			throw DomainError("CONFIRM_REQUIRED", "Removing a composition requires confirm");
		return projects.erase(id, revision);
	}
	if (method == "compositions.publish")
		return projects.build(id, revision, true);
	if (method == "compositions.rollback")
		// Restore author history only; explicit publication applies it to OBS.
		return projects.rollback(id, args["revision"].toString(), revision);
	auto composition = current["settings"].toObject()["composition"].toObject();
	if (method == "compositions.update") {
		const auto patch = args["patch"].toObject();
		for (auto it = patch.begin(); it != patch.end(); ++it) {
			if (!QStringList{"viewport", "background", "widgets"}.contains(it.key()))
				throw DomainError("IMMUTABLE_FIELD", "Unsupported composition patch field");
			composition[it.key()] = it.value();
		}
	} else {
		auto widgets = composition["widgets"].toArray();
		const auto widgetId = args["widgetId"].toString();
		int index = -1;
		for (int i = 0; i < widgets.size(); ++i)
			if (widgets[i].toObject()["id"] == widgetId)
				index = i;
		if (method == "compositions.widgets.add") {
			auto widget = args["widget"].toObject();
			widget["id"] = QUuid::createUuid().toString(QUuid::WithoutBraces);
			widgets.append(widget);
		} else {
			if (index < 0)
				throw DomainError("WIDGET_NOT_FOUND", "Composition widget not found");
			if (method == "compositions.widgets.remove")
				widgets.removeAt(index);
			else if (method == "compositions.widgets.update") {
				auto widget = widgets[index].toObject();
				const auto patch = args["patch"].toObject();
				for (auto it = patch.begin(); it != patch.end(); ++it) {
					if (it.key() == "id")
						throw DomainError("IMMUTABLE_FIELD", "Widget identity is immutable");
					widget[it.key()] = it.value();
				}
				widgets[index] = widget;
			} else
				throw DomainError("UNKNOWN_METHOD", "Unknown composition command");
		}
		composition["widgets"] = widgets;
	}
	const auto viewport = composition["viewport"].toObject();
	return projects.settings(
		id, {{"composition", composition}, {"width", viewport["width"]}, {"height", viewport["height"]}},
		revision);
}
} // namespace tt
