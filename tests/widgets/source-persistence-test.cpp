#include "widgets/WidgetManager.hpp"
#include "obs/BrowserSourceManager.hpp"
#include <obs.h>
#include <QCoreApplication>
#include <QFileInfo>
#include <QTemporaryDir>
#include <stdexcept>
#include <cstring>
static int refreshes = 0;
static bool refreshButton(obs_properties_t *, obs_property_t *, void *)
{
	++refreshes;
	return true;
}
static obs_properties_t *properties(void *)
{
	auto *p = obs_properties_create();
	obs_properties_add_button2(p, "refreshnocache", "Refresh", refreshButton, nullptr);
	return p;
}
static void *create(obs_data_t *, obs_source_t *)
{
	return bzalloc(1);
}
static void destroy(void *data)
{
	bfree(data);
}
static const char *name(void *)
{
	return "Mock Browser Source";
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	if (!obs_startup("en-US", nullptr, nullptr))
		return 1;
	obs_source_info info{};
	info.id = "browser_source";
	info.type = OBS_SOURCE_TYPE_INPUT;
	info.get_name = name;
	info.create = create;
	info.destroy = destroy;
	info.get_properties = properties;
	obs_register_source(&info);
	QTemporaryDir dir;
	tt::WidgetManager manager(dir.path(), WIDGET_ASSETS);
	auto widget = manager.create("gifts");
	manager.save();
	auto *settings = obs_data_create();
	obs_data_set_string(settings, "tiktok_widget_id", widget.id().toUtf8().constData());
	obs_data_set_string(settings, "local_file", manager.materialize(widget).toUtf8().constData());
	obs_data_set_bool(settings, "is_local_file", true);
	obs_data_set_string(settings, "css", "body { opacity:.8; }");
	obs_data_set_int(settings, "width", widget.width());
	auto *source = obs_source_create("browser_source", "Production gift", settings, nullptr);
	if (!source)
		throw std::runtime_error("mock source creation");
	auto *source2 = obs_source_create("browser_source", "Second matching source", settings, nullptr);
	auto other = manager.create("chat");
	manager.save();
	auto *otherSettings = obs_data_create();
	obs_data_set_string(otherSettings, "tiktok_widget_id", other.id().toUtf8().constData());
	obs_data_set_string(otherSettings, "local_file", manager.materialize(other).toUtf8().constData());
	auto *unrelated = obs_source_create("browser_source", "Unrelated source", otherSettings, nullptr);
	tt::BrowserSourceManager::refresh(widget, manager.materialize(widget));
	if (refreshes != 2)
		throw std::runtime_error("refresh must affect both matching sources only");
	auto *unchanged = obs_source_get_settings(unrelated);
	if (QString::fromUtf8(obs_data_get_string(unchanged, "local_file")) != manager.materialize(other))
		throw std::runtime_error("unrelated source changed");
	obs_data_release(unchanged);
	obs_source_release(source2);
	obs_source_release(unrelated);
	obs_data_release(otherSettings);
	auto *cssSettings = obs_source_get_settings(source);
	const auto css = QString::fromUtf8(obs_data_get_string(cssSettings, "css"));
	if (!css.startsWith("body { opacity:.8; }") || css.count("obs-tiktok-reload:") != 1)
		throw std::runtime_error("refresh changed author CSS");
	obs_data_release(cssSettings);
	tt::BrowserSourceManager::refresh(widget, manager.materialize(widget));
	cssSettings = obs_source_get_settings(source);
	if (QString::fromUtf8(obs_data_get_string(cssSettings, "css")).count("obs-tiktok-reload:") != 1)
		throw std::runtime_error("reload nonce accumulated");
	obs_data_release(cssSettings);
	auto *saved = obs_save_source(source);
	auto *before = obs_source_get_settings(source);
	const QByteArray snapshot(obs_data_get_json(before));
	manager.materializePlayground(widget);
	auto *after = obs_source_get_settings(source);
	if (snapshot != QByteArray(obs_data_get_json(after)))
		throw std::runtime_error("preview changed OBS settings");
	obs_data_release(before);
	obs_data_release(after);
	obs_source_release(source);
	auto *restored = obs_load_source(saved);
	if (!restored)
		throw std::runtime_error("source restore");
	auto *restoredSettings = obs_source_get_settings(restored);
	if (QString::fromUtf8(obs_data_get_string(restoredSettings, "tiktok_widget_id")) != widget.id() ||
	    QString::fromUtf8(obs_data_get_string(restoredSettings, "local_file")) != manager.materialize(widget))
		throw std::runtime_error("OBS source identity/path persistence");
	obs_data_release(restoredSettings);
	obs_source_release(restored);
	obs_data_release(saved);
	obs_data_release(settings);
	// Composition placement is idempotent in one scene and shares the same OBS
	// source identity across scenes. This uses a mock source, not CEF evidence.
	auto composition = manager.projects.create("builtin.composition");
	const auto compositionId = composition["id"].toString();
	tt::WidgetConfig canvas{composition["settings"].toObject()};
	{
		tt::WidgetManager restarted(dir.path(), WIDGET_ASSETS);
		if (QFileInfo::exists(restarted.projects.outputPath(compositionId)))
			throw std::runtime_error("restart published an unsaved composition");
		try {
			restarted.materialize(canvas);
			throw std::runtime_error("placement published a composition");
		} catch (const tt::DomainError &error) {
			if (error.code != "NOT_PUBLISHED")
				throw;
		}
	}
	manager.projects.build(compositionId, composition["revision"].toString(), true);
	auto *sceneA = obs_scene_create("Composition A");
	auto *sceneB = obs_scene_create("Composition B");
	const auto output = manager.projects.outputPath(compositionId);
	if (!tt::BrowserSourceManager::add(canvas, output, "Composition A", true) ||
	    !tt::BrowserSourceManager::add(canvas, output, "Composition A", true) ||
	    !tt::BrowserSourceManager::add(canvas, output, "Composition B", true))
		throw std::runtime_error("composition placement failed");
	int matching = 0;
	QString compositionName;
	for (const auto &value : tt::BrowserSourceManager::sources()) {
		const auto source = value.toObject();
		if (source["id"] == compositionId) {
			matching++;
			compositionName = source["name"].toString();
		}
	}
	if (matching != 1)
		throw std::runtime_error("duplicate composition source created");
	auto *itemA = obs_scene_find_source(sceneA, compositionName.toUtf8().constData());
	auto *itemB = obs_scene_find_source(sceneB, compositionName.toUtf8().constData());
	if (!itemA || !itemB || obs_sceneitem_get_source(itemA) != obs_sceneitem_get_source(itemB))
		throw std::runtime_error("composition source identity differs between scenes");
	obs_scene_release(sceneA);
	obs_scene_release(sceneB);
	obs_shutdown();
}
