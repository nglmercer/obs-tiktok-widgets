#include "widgets/WidgetManager.hpp"
#include <QCoreApplication>
#include <QTemporaryDir>
#include <QFile>
#include <stdexcept>
#include <iostream>
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	QTemporaryDir dir;
	tt::WidgetManager manager(dir.path(), WIDGET_ASSETS);
	auto chat = manager.create("chat");
	chat.value["name"] = "</script><script>unsafe</script>";
	manager.widgets[0] = chat;
	manager.create("gifts");
	manager.save();
	auto html = manager.materialize(chat);
	QFile config(dir.path() + "/widgets/" + chat.id() + "/config.js");
	if (!config.open(QIODevice::ReadOnly))
		throw std::runtime_error("config missing");
	if (config.readAll().contains("</script>"))
		throw std::runtime_error("script injection");
	tt::WidgetManager restored(dir.path(), WIDGET_ASSETS);
	if (restored.widgets.size() != 2 || restored.widgets[0].id() != chat.id())
		throw std::runtime_error("persistence");
	const auto editable = dir.path() + "/editable.html";
	QFile source(editable);
	if (!source.open(QIODevice::WriteOnly))
		throw std::runtime_error("editable source");
	source.write("<!doctype html><p>External edit retained</p>");
	source.close();
	restored.widgets[0].value["editableHtml"] = editable;
	restored.save();
	tt::WidgetManager edited(dir.path(), WIDGET_ASSETS);
	QFile generated(edited.materialize(edited.widgets[0]));
	if (!generated.open(QIODevice::ReadOnly) || !generated.readAll().contains("External edit retained"))
		throw std::runtime_error("external HTML edit survives restart");
	restored.duplicate(chat.id());
	if (restored.widgets.size() != 3 || restored.widgets[2].id() == chat.id())
		throw std::runtime_error("duplicate identity");
	restored.erase(chat.id());
	if (QFile::exists(html) || restored.widgets.size() != 2)
		throw std::runtime_error("deletion");
	std::cout << "Widget persistence, duplication, isolation, escaping and deletion passed\n";
}
