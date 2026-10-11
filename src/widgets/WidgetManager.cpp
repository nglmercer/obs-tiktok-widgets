#include "WidgetManager.hpp"
#include "WidgetRegistry.hpp"
#include "HtmlBootstrap.hpp"
#include <QRegularExpression>
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
static void validateId(const QString &id)
{
	if (!QRegularExpression("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$").match(id).hasMatch() ||
	    QUuid(id).isNull())
		throw std::runtime_error("Invalid widget UUID");
}
QString WidgetManager::materialize(const WidgetConfig &widget) const
{
	validateId(widget.id());
	return materializeAt(widget, directory + "/widgets/" + widget.id(), false);
}
QString WidgetManager::materializePlayground(const WidgetConfig &widget) const
{
	validateId(widget.id());
	const auto dir = directory + "/playground/" + widget.id();
	if (QFileInfo(directory + "/playground").isSymLink() || QFileInfo(dir).isSymLink())
		throw std::runtime_error("Unsafe playground directory");
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
	if (QFileInfo(dir).isSymLink() || QFileInfo(QFileInfo(dir).absolutePath()).isSymLink())
		throw std::runtime_error("Unsafe managed directory");
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
	const bool custom = widget.type() == "custom" || !widget.value["editableHtml"].toString().isEmpty();
	auto assetBase = QUrl::fromLocalFile(custom ? QFileInfo(html).absolutePath() + "/"
						    : directory + "/widgets/" + widget.id() + "/");
	const auto url = [](const QString &path) {
		return QUrl::fromLocalFile(path).toString().toHtmlEscaped();
	};
	// Remove known configuration script elements, then install one configuration before
	// any renderer. Leave all other user scripts and styles in their original order.
	QString document = QString::fromUtf8(page);
	const auto existingBase = htmlBaseHref(document);
	if (custom && !existingBase.isEmpty())
		assetBase = assetBase.resolved(QUrl(existingBase));

	// Built-in relative references point at generated assets; custom references retain
	// the author directory via base, including nested CSS/font/image dependencies.
	if (!custom) {
		document.replace("../widget.js", "widget.js");
		document.replace("../widget.css", "widget.css");
	}
	QString bootstrap;
	if (custom && existingBase.isEmpty())
		bootstrap += "<base href=\"" + assetBase.toString().toHtmlEscaped() + "\">";
	auto baseJson = QJsonDocument(QJsonArray{assetBase.toString()}).toJson(QJsonDocument::Compact);
	baseJson.replace("<", "\\u003c");
	baseJson.replace(">", "\\u003e");
	baseJson.replace("&", "\\u0026");
	bootstrap += "<script>window.TikTokWidgetAssetBase=" + QString::fromUtf8(baseJson).mid(1).chopped(1) +
		     ";window.TikTokWidgetConfig=" + QString::fromUtf8(json) + ";</script>";
	if (preview)
		bootstrap += "<script src=\"" + url(dir + "/frame.js") + "\"></script>";
	page = injectHtmlBootstrap(document.toUtf8(), bootstrap);
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
	validateId(id);
	if (QFileInfo(directory + "/widgets").isSymLink())
		throw std::runtime_error("Unsafe managed directory");
	for (auto w : widgets)
		if (w.id() == id) {
			w.value["id"] = QUuid::createUuid().toString(QUuid::WithoutBraces);
			w.value["name"] = w.name() + " copy";
			const auto editable = w.value["editableHtml"].toString();
			if (!editable.isEmpty()) {
				QFile source(editable);
				if (!source.open(QIODevice::ReadOnly))
					throw std::runtime_error("Editable HTML is missing");
				const auto folder = directory + "/widgets/" + w.id() + "/editable";
				QDir().mkpath(folder);
				const auto base = "<base href=\"" +
						  QUrl::fromLocalFile(QFileInfo(editable).absolutePath() + "/")
							  .toString()
							  .toHtmlEscaped() +
						  "\">";
				write(folder + "/index.html", injectHtmlBootstrap(source.readAll(), base));
				w.value["editableHtml"] = folder + "/index.html";
			}
			widgets.push_back(w);
			save();
			return w;
		}
	throw std::runtime_error("Widget not found");
}
void WidgetManager::erase(QString id)
{
	validateId(id);
	for (const auto &root : {"widgets", "playground"}) {
		const auto path = directory + "/" + root + "/" + id;
		if (QFileInfo(directory + "/" + root).isSymLink() || QFileInfo(path).isSymLink())
			throw std::runtime_error("Unsafe managed directory");
	}

	for (auto it = widgets.begin(); it != widgets.end(); ++it)
		if (it->id() == id) {
			widgets.erase(it);
			break;
		}
	QDir(directory + "/widgets/" + id).removeRecursively();
	QDir(directory + "/playground/" + id).removeRecursively();
	save();
}
} // namespace tt
