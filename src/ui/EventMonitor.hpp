#pragma once
#include <QWidget>
#include <QJsonObject>
class QPlainTextEdit;
class QLineEdit;
class QCheckBox;
namespace tt {
class EventMonitor : public QWidget {
	QPlainTextEdit *log;
	QLineEdit *filter;
	QCheckBox *paused;

public:
	explicit EventMonitor(QWidget * = nullptr);
	void append(const QJsonObject &);
};
} // namespace tt
