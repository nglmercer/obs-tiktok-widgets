#include "WidgetManager.hpp"
#include "WidgetRegistry.hpp"
#include <QUrl>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QSaveFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QUuid>
#include <stdexcept>
namespace tt {
static void write(const QString &path, const QByteArray &bytes)
{
	QSaveFile f(path);
	if (!f.open(QIODevice::WriteOnly) || f.write(bytes) != bytes.size() || !f.commit())
		throw std::runtime_error("Cannot persist widget file");
}
WidgetManager::WidgetManager(QString d, QString a) : directory(std::move(d)), assets(std::move(a))
{
	QDir().mkpath(directory + "/widgets");
	load();
	for (const auto &widget : widgets) {
		try {
			materialize(widget);
		} catch (const std::exception &e) {
			restorationError = QString::fromUtf8(e.what());
		}
	}
}
void WidgetManager::load()
{
	QFile f(directory + "/widgets.json");
	if (f.open(QIODevice::ReadOnly)) {
		for (auto v : QJsonDocument::fromJson(f.readAll()).array()) {
			auto o = v.toObject();
			auto id = o["id"].toString();
			if (QUuid(id).isNull() || !WidgetRegistry::templates().contains(o["template"].toString()))
				continue;
			widgets.push_back({o});
		}
	}
}
void WidgetManager::save()
{
	QJsonArray list;
	for (const auto &w : widgets) {
		materialize(w);
		list.push_back(w.value);
	}
	write(directory + "/widgets.json", QJsonDocument(list).toJson());
}
QString WidgetManager::materialize(const WidgetConfig &widget) const
{
	return materializeAt(widget, directory + "/widgets/" + widget.id(), false);
}
QString WidgetManager::materializePlayground(const WidgetConfig &widget) const
{
	const auto dir = directory + "/playground/" + widget.id();
	QDir().mkpath(dir);
	for (const auto &name : {"index.html", "app.js", "playground.css", "frame.js"}) {
		QFile asset(assets + "/playground/" + name);
		if (!asset.open(QIODevice::ReadOnly))
			throw std::runtime_error("Packaged playground assets are missing");
		write(dir + "/" + name, asset.readAll());
	}
	materializeAt(widget, dir, true);
	return dir + "/index.html";
}
QString WidgetManager::materializeAt(const WidgetConfig &widget, const QString &dir, bool preview) const
{
	QDir().mkpath(dir);
	auto json = QJsonDocument(widget.value).toJson(QJsonDocument::Compact);
	json.replace("<", "\\u003c");
	json.replace(">", "\\u003e");
	json.replace("&", "\\u0026");
	write(dir + "/config.js", "window.TikTokWidgetConfig=" + json + ";\n");
	QFile script(assets + "/widgets/widget.js"), css(assets + "/widgets/widget.css");
	if (!script.open(QIODevice::ReadOnly) || !css.open(QIODevice::ReadOnly))
		throw std::runtime_error("Packaged widget assets are missing");
	write(dir + "/widget.js", script.readAll());
	write(dir + "/widget.css", css.readAll());
	QFile html(assets + "/widgets/" + widget.type() + "/index.html");
	if (!widget.value["editableHtml"].toString().isEmpty())
		html.setFileName(widget.value["editableHtml"].toString());
	else if (widget.type() == "custom")
		html.setFileName(widget.value["customHtml"].toString());
	if (!html.open(QIODevice::ReadOnly))
		throw std::runtime_error("Widget HTML is missing");
	auto page = html.readAll();
	if (!widget.value["editableHtml"].toString().isEmpty()) {
		const auto folder = QFileInfo(html).absolutePath();
		if (!preview)
			write(folder + "/config.js", "window.TikTokWidgetConfig=" + json + ";\n");
		page = "<base href=\"" + QUrl::fromLocalFile(folder + "/").toString().toHtmlEscaped().toUtf8() +
		       "\">\n" + page;
	}
	page.replace("../widget.js", "widget.js");
	page.replace("../widget.css", "widget.css");
	if (widget.type() == "custom")
		page = "<script src=\"config.js\"></script><base href=\"" +
		       QUrl::fromLocalFile(QFileInfo(html).absolutePath() + "/").toString().toHtmlEscaped().toUtf8() +
		       "\">\n" + page;
	if (preview) {
		page.replace("src=\"config.js\"",
			     "src=\"" + QUrl::fromLocalFile(dir + "/config.js").toString().toHtmlEscaped().toUtf8() +
				     "\"");
		// Keep custom HTML verbatim after bootstrap. The system-browser sandbox frame receives
		// only local postMessages; it has no OBS bridge or plugin transport.
		const auto url = QUrl::fromLocalFile(dir + "/frame.js").toString().toHtmlEscaped().toUtf8();
		page = "<script>window.TikTokWidgetConfig=" + json + ";</script><script src=\"" + url +
		       "\"></script>\n" + page;
	}
	const auto path = dir + (preview ? "/preview.html" : "/index.html");
	write(path, page);
	return path;
}
WidgetConfig WidgetManager::create(QString type)
{
	auto w = WidgetConfig::create(type);
	widgets.push_back(w);
	return w;
}
WidgetConfig WidgetManager::duplicate(QString id)
{
	for (auto w : widgets)
		if (w.id() == id) {
			w.value["id"] = QUuid::createUuid().toString(QUuid::WithoutBraces);
			w.value["name"] = w.name() + " copy";
			widgets.push_back(w);
			save();
			return w;
		}
	throw std::runtime_error("Widget not found");
}
void WidgetManager::erase(QString id)
{
	for (auto it = widgets.begin(); it != widgets.end(); ++it)
		if (it->id() == id) {
			widgets.erase(it);
			break;
		}
	QDir(directory + "/widgets/" + id).removeRecursively();
	save();
}
} // namespace tt
