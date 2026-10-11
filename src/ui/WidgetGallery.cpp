#include "WidgetGallery.hpp"
#include "widgets/WidgetRegistry.hpp"
#include <QInputDialog>
namespace tt {
QString WidgetGallery::choose(QWidget *p)
{
	bool ok = false;
	auto s = QInputDialog::getItem(p, QObject::tr("Create widget"), QObject::tr("Template"),
				       WidgetRegistry::templates(), 0, false, &ok);
	return ok ? s : QString{};
}
} // namespace tt
