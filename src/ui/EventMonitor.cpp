#include "UiLocale.hpp"
#include "EventMonitor.hpp"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QTreeWidget>
#include <QHeaderView>
#include <QComboBox>
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
		item->setText(1, uiTr("Object (%1 fields)").arg(object.size()));
		for (auto it = object.begin(); it != object.end(); ++it)
			appendJsonField(item, it.key(), it.value());
	} else if (value.isArray()) {
		const auto array = value.toArray();
		item->setText(1, uiTr("Array (%1 items)").arg(array.size()));
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
	filter = new QComboBox;
	filter->setObjectName("eventTypeFilter");
	filter->addItem(uiTr("LIVE events (hide connection state)"), "live");
	filter->addItem(uiTr("All events"), "all");
	for (auto type : {"chat", "gift", "like", "follow", "member", "social", "roomUser", "state", "unknown"})
		filter->addItem(QString::fromLatin1(type), QString::fromLatin1(type));
	paused = new QCheckBox(uiTr("Pause"));
	auto *controls = new QHBoxLayout;
	auto *clear = new QPushButton(uiTr("Clear"));
	auto *copy = new QPushButton(uiTr("Copy JSON"));
	controls->addWidget(paused);
	controls->addStretch();
	controls->addWidget(copy);
	controls->addWidget(clear);
	log = new QTreeWidget;
	log->setObjectName("eventJsonTree");
	log->setHeaderLabels({uiTr("Event / field"), uiTr("Value")});
	log->setAlternatingRowColors(true);
	log->setUniformRowHeights(true);
	log->header()->setSectionResizeMode(0, QHeaderView::Interactive);
	log->header()->setStretchLastSection(true);
	log->setColumnWidth(0, 160);
	connect(clear, &QPushButton::clicked, this, [this] {
		log->clear();
		lastState = {};
	});
	connect(filter, &QComboBox::currentIndexChanged, this, [this] { applyFilter(); });
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
		item->setHidden(filter->currentData() == "live"
					? item->data(0, Qt::UserRole) == "state"
					: filter->currentData() != "all" &&
						  item->data(0, Qt::UserRole) != filter->currentData());
	}
}
void EventMonitor::append(const QJsonObject &event)
{
	if (paused->isChecked())
		return;
	if (event["type"] == "state") {
		const auto state = event["data"].toObject();
		if (!lastState.isEmpty() && state == lastState)
			return;
		lastState = state;
	}
	const bool follow = log->verticalScrollBar() == nullptr || !log->currentItem();
	auto copy = event;
	copy.remove("native");
	auto *root = new QTreeWidgetItem(log);
	const auto type = event["type"].toString();
	root->setText(0, type);
	root->setText(1, event["synthetic"].toBool() ? uiTr("Test event") : event["method"].toString());
	root->setData(0, Qt::UserRole, type);
	root->setData(0, Qt::UserRole + 1, QString::fromUtf8(QJsonDocument(copy).toJson(QJsonDocument::Indented)));
	for (auto it = copy.begin(); it != copy.end(); ++it)
		appendJsonField(root, it.key(), it.value());
	if (filter->findData(type) < 0)
		filter->addItem(type, type);
	applyFilter();
	while (log->topLevelItemCount() > 200)
		delete log->takeTopLevelItem(0);
	if (follow)
		log->scrollToItem(root);
}
} // namespace tt
