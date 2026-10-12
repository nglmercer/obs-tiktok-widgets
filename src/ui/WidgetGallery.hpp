#pragma once
#include <QString>
class QWidget;
namespace tt {
class WidgetProjectService;
class WidgetGallery {
public:
	static QString choose(QWidget *,WidgetProjectService *service=nullptr);
};
} // namespace tt
