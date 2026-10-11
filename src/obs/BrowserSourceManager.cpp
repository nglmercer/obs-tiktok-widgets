#include "BrowserSourceManager.hpp"
#include <obs.h>
#include <obs-frontend-api.h>
namespace tt {
static void settings(obs_data_t *d, const WidgetConfig &w, const QString &html)
{
	obs_data_set_bool(d, "is_local_file", true);
	obs_data_set_string(d, "local_file", html.toUtf8().constData());
	obs_data_set_int(d, "width", w.width());
	obs_data_set_int(d, "height", w.height());
	obs_data_set_bool(d, "shutdown", false);
	obs_data_set_bool(d, "restart_when_active", false);
	obs_data_set_string(d, "tiktok_widget_id", w.id().toUtf8().constData());
}
bool BrowserSourceManager::add(const WidgetConfig &w, const QString &html, const QString &sceneName)
{
	auto *sceneSource = sceneName.isEmpty() ? obs_frontend_get_current_scene()
						: obs_get_source_by_name(sceneName.toUtf8().constData());
	if (!sceneSource)
		return false;
	auto *scene = obs_scene_from_source(sceneSource);
	if (!scene) {
		obs_source_release(sceneSource);
		return false;
	}
	auto *d = obs_data_create();
	settings(d, w, html);
	auto name = (w.name() + " [" + w.id().left(8) + "]").toUtf8();
	auto *source = obs_source_create("browser_source", name.constData(), d, nullptr);
	obs_data_release(d);
	if (source) {
		obs_scene_add(scene, source);
		obs_source_release(source);
	}
	obs_source_release(sceneSource);
	return source != nullptr;
}
struct Visit {
	QString id;
	const WidgetConfig *widget;
	QString html;
	bool erase;
};
static bool visit(void *opaque, obs_source_t *source)
{
	auto &v = *static_cast<Visit *>(opaque);
	auto *d = obs_source_get_settings(source);
	bool same = v.id == QString::fromUtf8(obs_data_get_string(d, "tiktok_widget_id"));
	if (same) {
		if (v.erase)
			obs_source_remove(source);
		else {
			settings(d, *v.widget, v.html);
			obs_source_update(source, d);
			auto *properties = obs_source_properties(source);
			auto *refresh = obs_properties_get(properties, "refreshnocache");
			if (refresh)
				obs_property_button_clicked(refresh, source);
			obs_properties_destroy(properties);
		}
	}
	obs_data_release(d);
	return true;
}
void BrowserSourceManager::refresh(const WidgetConfig &w, const QString &html)
{
	Visit v{w.id(), &w, html, false};
	obs_enum_sources(visit, &v);
}
void BrowserSourceManager::remove(const QString &id)
{
	Visit v{id, nullptr, {}, true};
	obs_enum_sources(visit, &v);
}
} // namespace tt
