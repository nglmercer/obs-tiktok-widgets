#pragma once
#include "WidgetProjectService.hpp"
#include <functional>
namespace tt {
class WidgetCommands {
	WidgetProjectService &service;

public:
	std::function<QJsonValue(const QString &, const QJsonObject &)> obs;
	explicit WidgetCommands(WidgetProjectService &service) : service(service) {}
	QJsonValue execute(const QString &method, const QJsonObject &args);
	static QStringList methods();
};
} // namespace tt
