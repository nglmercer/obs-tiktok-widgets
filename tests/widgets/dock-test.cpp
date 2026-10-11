#include "ui/TikTokDock.hpp"
#include "ui/EventMonitor.hpp"
#include "core/EventNormalizer.hpp"
#include <QComboBox>
#include <QTreeWidget>
#include <QApplication>
#include <QTemporaryDir>
#include <QTabWidget>
#include <QLineEdit>
#include <QPushButton>
#include <QLabel>
#include <stdexcept>
#include <iostream>
static void check(bool v, const char *m)
{
	if (!v)
		throw std::runtime_error(m);
}
int main(int argc, char **argv)
{
	QApplication app(argc, argv);
	QTemporaryDir temp;
	tt::PluginConfig config(temp.path());
	tt::WidgetManager widgets(temp.path(), WIDGET_ASSETS);
	tt::EventDispatcher dispatcher;
	tt::TikTokConnectionManager connection(dispatcher);
	tt::TikTokDock dock(config, connection, dispatcher, widgets);
	auto *tabs = dock.findChild<QTabWidget *>("tiktokTabs");
	check(tabs && tabs->count() == 3, "three tabs");
	check(tabs->tabText(0) == "Connection" && tabs->tabText(1) == "Widgets" && tabs->tabText(2) == "Events",
	      "tab names");
	auto *username = dock.findChild<QLineEdit *>("tiktokUsername");
	check(username != nullptr, "simple username flow");
	for (auto *button : dock.findChildren<QPushButton *>()) {
		check(!button->text().contains("Download"), "no manual bundle download button");
		if (button->text() == "Connect")
			button->click();
	}
	check(dock.findChild<QLabel *>("connectionStatus")->text().contains("username"), "empty username inline error");
	check(connection.getState() == TTL_CONNECTION_DISCONNECTED, "no connection for empty username");
	auto *selector = dock.findChild<QComboBox *>("testEventType");
	check(selector && selector->count() == 8, "test event selector");
	selector->setCurrentIndex(selector->findData("chat"));
	for (auto *button : dock.findChildren<QPushButton *>())
		if (button->text() == "Generate test events")
			button->click();
	auto events = dispatcher.take();
	check(events.size() == 1 && events[0]["type"] == "chat", "selected event only");
	auto *tree = dock.findChild<QTreeWidget *>("eventJsonTree");
	auto *monitor = static_cast<tt::EventMonitor *>(tree->parentWidget());
	monitor->append(events[0]);
	check(tree->topLevelItemCount() == 1 && tree->topLevelItem(0)->childCount() > 0, "structured JSON rendering");
	tree->topLevelItem(0)->setExpanded(true);
	auto *filter = dock.findChild<QLineEdit *>("eventTypeFilter");
	filter->setText("gift");
	check(tree->topLevelItem(0)->isHidden(), "filter existing events");
	filter->clear();
	for (int i = 0; i < 205; ++i)
		monitor->append(tt::EventNormalizer::synthetic("like", i));
	check(tree->topLevelItemCount() == 200, "bounded rendered history");
	monitor->append(events[0]);
	tree->topLevelItem(199)->setExpanded(true);
	dock.resize(480, 680);
	dock.show();
	app.processEvents();
	for (int i = 0; i < tabs->count(); ++i) {
		tabs->setCurrentIndex(i);
		app.processEvents();
		check(dock.grab().save(QString("dock-tab-%1.png").arg(i)), "tab render");
	}
	dock.cancelPendingConnection();
	std::cout << "Tabbed dock, simplified connect controls and inline validation passed\n";
}
