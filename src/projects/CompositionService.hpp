#pragma once
#include "WidgetProjectService.hpp"
namespace tt {
void validateCompositionDocument(const QJsonObject &document, const QJsonObject &schema);
// Compositions are ordinary revisioned projects, sharing locks, history and releases.
class CompositionService {
	WidgetProjectService &projects;
	QJsonObject project(const QString &id) const;
	void requireRevision(const QString &id, const QString &revision) const;

public:
	explicit CompositionService(WidgetProjectService &value) : projects(value) {}
	QJsonValue execute(const QString &method, const QJsonObject &args);
};
} // namespace tt
