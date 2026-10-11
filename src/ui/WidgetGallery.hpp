#pragma once
#include <QString>
class QWidget;
namespace tt {
class WidgetGallery {
public:
	static QString choose(QWidget *);
};
} // namespace tt
