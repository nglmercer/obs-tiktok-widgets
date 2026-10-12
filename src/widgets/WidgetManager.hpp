#pragma once
#include "WidgetConfig.hpp"
#include "projects/WidgetProjectService.hpp"
#include <QList>
namespace tt {
class WidgetManager {
	QString directory, assets;
	void ensureProject(const WidgetConfig &) const;

public:
	mutable WidgetProjectService projects;
	QList<WidgetConfig> widgets;
	QString restorationError;
	WidgetManager(QString directory, QString assets);
	void load();
	void save();
	QString materialize(const WidgetConfig &) const;
	QString materializePlayground(const WidgetConfig &) const;
	QJsonObject publish(const QString &id, const QString &revision = {});
	WidgetConfig create(QString type);
	WidgetConfig duplicate(QString id);
	void erase(QString id);
};
} // namespace tt
