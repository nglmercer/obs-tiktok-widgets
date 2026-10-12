#pragma once
#include <QDialog>
#include "widgets/WidgetConfig.hpp"
namespace tt {
class WidgetProjectService;
class WidgetEditor {
public:
	static bool edit(WidgetConfig &, QWidget *, WidgetProjectService *service=nullptr);
};
} // namespace tt
