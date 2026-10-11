#pragma once
#include <QWidget>
#include <QJsonObject>
class QTreeWidget;
class QLineEdit;
class QCheckBox;
namespace tt {
class EventMonitor : public QWidget {
	QTreeWidget *log;
	void applyFilter();
	QLineEdit *filter;
	QCheckBox *paused;

public:
	explicit EventMonitor(QWidget * = nullptr);
	void append(const QJsonObject &);
};
} // namespace tt
