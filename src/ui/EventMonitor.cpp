#include "EventMonitor.hpp"
#include <QVBoxLayout>
#include <QPlainTextEdit>
#include <QLineEdit>
#include <QCheckBox>
#include <QPushButton>
#include <QJsonDocument>
namespace tt {
EventMonitor::EventMonitor(QWidget *p) : QWidget(p)
{
	auto *l = new QVBoxLayout(this);
	filter = new QLineEdit;
	filter->setPlaceholderText(tr("Filter event type"));
	paused = new QCheckBox(tr("Pause"));
	log = new QPlainTextEdit;
	log->setReadOnly(true);
	log->setMaximumBlockCount(500);
	auto *clear = new QPushButton(tr("Clear"));
	connect(clear, &QPushButton::clicked, log, &QPlainTextEdit::clear);
	l->addWidget(filter);
	l->addWidget(paused);
	l->addWidget(clear);
	l->addWidget(log);
}
void EventMonitor::append(const QJsonObject &e)
{
	if (paused->isChecked() || (!filter->text().isEmpty() && e["type"].toString() != filter->text()))
		return;
	auto copy = e;
	copy.remove("native");
	log->appendPlainText(QString::fromUtf8(QJsonDocument(copy).toJson(QJsonDocument::Compact)));
}
} // namespace tt
