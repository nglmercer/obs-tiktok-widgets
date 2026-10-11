#include "widgets/WidgetManager.hpp"
#include "widgets/HtmlBootstrap.hpp"
#include <QCoreApplication>
#include <QTemporaryDir>
#include <QFile>
#include <QFileInfo>
#include <QDir>
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
	auto read = [](const QString &path) {
		QFile file(path);
		if (!file.open(QIODevice::ReadOnly))
			throw std::runtime_error("Cannot read fixture");
		return file.readAll();
	};
	const auto beforeSettings = read(dir.path() + "/widgets.json");
	const auto beforeHtml = read(edited.materialize(edited.widgets[0]));
	const auto beforeExternal = read(editable);
	const auto beforeConfig = read(dir.path() + "/widgets/" + chat.id() + "/config.js");
	const auto beforeWidget = edited.widgets[0].value;
	const auto playground = edited.materializePlayground(edited.widgets[0]);
	if (!read(playground).contains("sandbox=\"allow-scripts allow-same-origin\"") ||
	    !read(QFileInfo(playground).absolutePath() + "/preview.html").contains("External edit retained"))
		throw std::runtime_error("isolated preview preserves custom HTML");
	if (read(dir.path() + "/widgets.json") != beforeSettings || read(editable) != beforeExternal ||
	    read(dir.path() + "/widgets/" + chat.id() + "/config.js") != beforeConfig ||
	    edited.widgets[0].value != beforeWidget || read(edited.materialize(edited.widgets[0])) != beforeHtml)
		throw std::runtime_error("playground mutated production files or identity");
	for (const auto &widget : edited.widgets) {
		const auto page = edited.materializePlayground(widget);
		for (auto asset : {"app.js", "frame.js", "playground.css", "widget.js", "widget.css", "preview.html"})
			if (read(QFileInfo(page).absolutePath() + "/" + asset).isEmpty())
				throw std::runtime_error("packaged preview asset missing");
	}
	for (auto type : {"chat", "gifts", "alerts", "likes", "viewers", "events"}) {
		const auto templateWidget = tt::WidgetConfig::create(type);
		const auto page = edited.materializePlayground(templateWidget);
		if (!read(QFileInfo(page).absolutePath() + "/preview.html").contains("frame.js"))
			throw std::runtime_error("template preview bootstrap missing");
	}
	for (const auto &document :
	     {QByteArray("<!doctype html><html><HEAD class='x > y'></HEAD><body>content</body></html>"),
	      QByteArray("<!DOCTYPE html><html><body>content</body></html>"),
	      QByteArray("<!doctype html><!-- <head> --><p>content</p>")}) {
		const auto injected = tt::injectHtmlBootstrap(document, "<script>bootstrap()</script>");
		if (!injected.startsWith(document.left(document.indexOf('>') + 1)) ||
		    injected.indexOf("bootstrap()") < injected.indexOf("<head", 0))
			throw std::runtime_error("doctype injection");
	}
	if (tt::htmlBaseHref(
		    "<!-- <base href='wrong'> --><script>const text=\"<base href='bad'>\";</script><base href='nested/'>") !=
	    "nested/")
		throw std::runtime_error("base tokenization");
	const auto twice = tt::injectHtmlBootstrap(
		tt::injectHtmlBootstrap(
			"<!doctype html><html><head></head><body><script src='config.js'></script></body></html>",
			"<script>one()</script>"),
		"<script>two()</script>");
	if (twice.contains("one()") || twice.contains("config.js") || twice.count("two()") != 1)
		throw std::runtime_error("duplicate bootstrap");
	const auto previewDir = QFileInfo(playground).absolutePath();
	const auto otherPreview = edited.materializePlayground(edited.widgets[1]);
	for (const auto &invalid :
	     {QString("../"), QString("../../editable.html"), QString("{00000000-0000-0000-0000-000000000001}")}) {
		bool rejected = false;
		try {
			edited.erase(invalid);
		} catch (const std::exception &) {
			rejected = true;
		}
		if (!rejected || read(editable) != beforeExternal)
			throw std::runtime_error("unsafe deletion");
	}
	const auto linkedId = tt::WidgetConfig::create("chat").id();
	QDir().mkpath(dir.path() + "/outside");
	QFile marker(dir.path() + "/outside/keep");
	if (!marker.open(QIODevice::WriteOnly))
		throw std::runtime_error("marker write");
	marker.write("keep");
	marker.close();
	if (QFile::link(dir.path() + "/outside", dir.path() + "/playground/" + linkedId)) {
		bool rejected = false;
		try {
			edited.erase(linkedId);
		} catch (const std::exception &) {
			rejected = true;
		}
		if (!rejected || !QFile::exists(dir.path() + "/outside/keep"))
			throw std::runtime_error("symlink deletion");
	}
	restored.duplicate(chat.id());
	if (restored.widgets[2].value["editableHtml"].toString() == editable ||
	    !QFile::exists(restored.widgets[2].value["editableHtml"].toString()))
		throw std::runtime_error("duplicate editable isolation");
	if (restored.widgets.size() != 3 || restored.widgets[2].id() == chat.id())
		throw std::runtime_error("duplicate identity");
	restored.erase(chat.id());
	if (QFile::exists(html) || QFileInfo::exists(previewDir) || !QFile::exists(otherPreview) ||
	    read(editable) != beforeExternal || restored.widgets.size() != 2)
		throw std::runtime_error("deletion");
	const auto fixtureRoot = qEnvironmentVariable("PLAYGROUND_FIXTURE_DIR");
	if (!fixtureRoot.isEmpty()) {
		QDir().mkpath(fixtureRoot + "/author/nested");
		auto put = [](const QString &path, const QByteArray &bytes) {
			QFile f(path);
			if (!f.open(QIODevice::WriteOnly) || f.write(bytes) != bytes.size())
				throw std::runtime_error("fixture write");
		};
		put(fixtureRoot + "/author/nested/style.css", "#asset { color: rgb(12, 34, 56); }");
		put(fixtureRoot + "/author/nested/code.js", "window.customAssetLoaded=true;");
		put(fixtureRoot + "/author/image.svg",
		    "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='10' height='10' fill='red'/></svg>");
		put(fixtureRoot + "/author/index.html",
		    "<!DOCTYPE html><!-- <head>fake</head> --><html><body><p id='asset'>Custom</p><img src='image.svg'><link rel='stylesheet' href='nested/style.css'><script src='nested/code.js'></script><script src='config.js'></script></body></html>");
		tt::WidgetManager fixtures(fixtureRoot, WIDGET_ASSETS);
		auto custom = fixtures.create("custom");
		custom.value["customHtml"] = fixtureRoot + "/author/index.html";
		fixtures.widgets[0] = custom;
		fixtures.save();
		put(fixtureRoot + "/preview-path.txt", fixtures.materializePlayground(custom).toUtf8());
		const auto builtin = fixtures.create("gifts");
		put(fixtureRoot + "/builtin-path.txt", fixtures.materializePlayground(builtin).toUtf8());
	}
	std::cout << "Widget persistence, duplication, isolation, escaping and deletion passed\n";
}
