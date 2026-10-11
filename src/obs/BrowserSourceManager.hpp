#pragma once
#include "widgets/WidgetConfig.hpp"
#include <QString>
namespace tt {
class BrowserSourceManager {
public:
	static bool add(const WidgetConfig &, const QString &html, const QString &scene = {});
	static void refresh(const WidgetConfig &, const QString &html);
	static void remove(const QString &id);
};
} // namespace tt
