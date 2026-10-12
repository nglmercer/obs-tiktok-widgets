#include "WidgetRegistry.hpp"
#include "templates/TemplateRegistry.hpp"
namespace tt {
QStringList WidgetRegistry::templates(const QString &config, const QString &assets)
{
	QStringList result;
	TemplateRegistry registry(config, assets);
	for (const auto &value : registry.list()) {
		const auto id = value.toObject()["id"].toString();
		if (!result.contains(id))
			result << id;
	}
	return result;
}
} // namespace tt
