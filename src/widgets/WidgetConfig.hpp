#pragma once
#include <QJsonObject>
namespace tt {
struct WidgetConfig {
	QJsonObject value;
	QString id() const { return value["id"].toString(); }
	QString type() const { return value["template"].toString(); }
	QString name() const { return value["name"].toString(); }
	int width() const { return value["width"].toInt(600); }
	int height() const { return value["height"].toInt(400); }
	static WidgetConfig create(const QString &);
};
} // namespace tt
