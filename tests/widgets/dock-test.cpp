#include "ui/TikTokDock.hpp"
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
