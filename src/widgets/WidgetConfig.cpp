#include "WidgetConfig.hpp"
#include <QUuid>
#include <QJsonArray>
namespace tt {
WidgetConfig WidgetConfig::create(const QString &type)
{
	return {{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)},
		 {"template", type},
		 {"name", type + " widget"},
		 {"width", 600},
		 {"height", 400},
		 {"theme", "dark"},
		 {"color", "#ff416c"},
		 {"customCss", ""},
		 {"filters", QJsonArray{}},
		 {"animation", true},
		 {"sound", false},
		 {"soundUrl", ""},
		 {"messageLimit", 30},
		 {"likeAggregationMs", 250},
		 {"viewerCoalescingMs", 250}}};
}
} // namespace tt
