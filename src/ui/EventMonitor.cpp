#include "EventMonitor.hpp"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QTreeWidget>
#include <QHeaderView>
#include <QLineEdit>
#include <QCheckBox>
#include <QPushButton>
#include <QJsonArray>
#include <QJsonDocument>
#include <QApplication>
#include <QClipboard>
namespace tt {
namespace {
void appendJsonField(QTreeWidgetItem *parent, const QString &key, const QJsonValue &value)
{
	auto *item = new QTreeWidgetItem(parent);
	item->setText(0, key);
	if (value.isObject()) {
		const auto object = value.toObject();
		item->setText(1, QObject::tr("Object (%1 fields)").arg(object.size()));
		for (auto it = object.begin(); it != object.end(); ++it)
			appendJsonField(item, it.key(), it.value());
	} else if (value.isArray()) {
		const auto array = value.toArray();
		item->setText(1, QObject::tr("Array (%1 items)").arg(array.size()));
		for (int i = 0; i < array.size(); ++i)
			appendJsonField(item, QString::number(i), array[i]);
	} else {
		QString text;
		if (value.isString())
			text = value.toString();
		else if (value.isBool())
			text = value.toBool() ? "true" : "false";
		else if (value.isDouble())
			text = QString::number(value.toDouble(), 'g', 17);
		else
			text = "null";
		item->setText(1, text);
		item->setToolTip(1, text);
	}
}
} // namespace
EventMonitor::EventMonitor(QWidget *p) : QWidget(p)
{
	auto *layout = new QVBoxLayout(this);
	filter = new QLineEdit;
	filter->setObjectName("eventTypeFilter");
	filter->setPlaceholderText(tr("Filter event type"));
	paused = new QCheckBox(tr("Pause"));
	auto *controls = new QHBoxLayout;
	auto *clear = new QPushButton(tr("Clear"));
	auto *copy = new QPushButton(tr("Copy JSON"));
	controls->addWidget(paused);
	controls->addStretch();
	controls->addWidget(copy);
	controls->addWidget(clear);
	log = new QTreeWidget;
	log->setObjectName("eventJsonTree");
	log->setHeaderLabels({tr("Event / field"), tr("Value")});
	log->setAlternatingRowColors(true);
	log->setUniformRowHeights(true);
	log->header()->setSectionResizeMode(0, QHeaderView::Interactive);
	log->header()->setStretchLastSection(true);
	log->setColumnWidth(0, 160);
	connect(clear, &QPushButton::clicked, log, &QTreeWidget::clear);
	connect(filter, &QLineEdit::textChanged, this, [this] { applyFilter(); });
	connect(copy, &QPushButton::clicked, this, [this] {
		auto *item = log->currentItem();
		if (!item)
			return;
		while (item->parent())
			item = item->parent();
		QApplication::clipboard()->setText(item->data(0, Qt::UserRole + 1).toString());
	});
	layout->addWidget(filter);
	layout->addLayout(controls);
	layout->addWidget(log);
}
void EventMonitor::applyFilter()
{
	for (int i = 0; i < log->topLevelItemCount(); ++i) {
		auto *item = log->topLevelItem(i);
		item->setHidden(!filter->text().isEmpty() &&
				!item->data(0, Qt::UserRole).toString().contains(filter->text(), Qt::CaseInsensitive));
	}
}
void EventMonitor::append(const QJsonObject &event)
{
	if (paused->isChecked())
		return;
	const bool follow = log->verticalScrollBar() == nullptr || !log->currentItem();
	auto copy = event;
	copy.remove("native");
	auto *root = new QTreeWidgetItem(log);
	const auto type = event["type"].toString();
	root->setText(0, type);
	root->setText(1, event["synthetic"].toBool() ? tr("Test event") : event["method"].toString());
	root->setData(0, Qt::UserRole, type);
	root->setData(0, Qt::UserRole + 1, QString::fromUtf8(QJsonDocument(copy).toJson(QJsonDocument::Indented)));
	for (auto it = copy.begin(); it != copy.end(); ++it)
		appendJsonField(root, it.key(), it.value());
	root->setHidden(!filter->text().isEmpty() && !type.contains(filter->text(), Qt::CaseInsensitive));
	while (log->topLevelItemCount() > 200)
		delete log->takeTopLevelItem(0);
	if (follow)
		log->scrollToItem(root);
}
} // namespace tt
