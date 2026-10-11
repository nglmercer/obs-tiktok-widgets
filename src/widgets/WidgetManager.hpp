#pragma once
#include "WidgetConfig.hpp"
#include <QList>
namespace tt {
class WidgetManager {
	QString directory, assets;
	QString materializeAt(const WidgetConfig &, const QString &dir, bool preview) const;

public:
	QList<WidgetConfig> widgets;
	QString restorationError;
	WidgetManager(QString directory, QString assets);
	void load();
	void save();
	QString materialize(const WidgetConfig &) const;
	QString materializePlayground(const WidgetConfig &) const;
	WidgetConfig create(QString type);
	WidgetConfig duplicate(QString id);
	void erase(QString id);
};
} // namespace tt
