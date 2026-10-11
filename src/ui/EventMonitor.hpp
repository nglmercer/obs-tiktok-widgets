#pragma once
#include <QWidget>
#include <QJsonObject>
class QTreeWidget;
class QComboBox;
class QCheckBox;
namespace tt {
class EventMonitor : public QWidget {
	QTreeWidget *log;
	void applyFilter();
	QComboBox *filter;
	QCheckBox *paused;
	QJsonObject lastState;

public:
	explicit EventMonitor(QWidget * = nullptr);
	void append(const QJsonObject &);
};
} // namespace tt
