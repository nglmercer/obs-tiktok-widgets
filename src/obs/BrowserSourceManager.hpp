#pragma once
#include "widgets/WidgetConfig.hpp"
#include <QString>
#include <QJsonArray>
namespace tt {
class BrowserSourceManager {
public:
	static bool add(const WidgetConfig &, const QString &html, const QString &scene = {}, bool reuse = false);
	static void refresh(const WidgetConfig &, const QString &html);
	static void remove(const QString &id, const QString &scene = {});
	static QJsonArray sources();
};
} // namespace tt
