#include "WidgetRegistry.hpp"
namespace tt {
QStringList WidgetRegistry::templates()
{
	return {"chat", "gifts", "alerts", "likes", "viewers", "events", "custom"};
}
} // namespace tt
