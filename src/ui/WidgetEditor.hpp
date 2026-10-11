#pragma once
#include <QDialog>
#include "widgets/WidgetConfig.hpp"
namespace tt {
class WidgetEditor {
public:
	static bool edit(WidgetConfig &, QWidget *);
};
} // namespace tt
