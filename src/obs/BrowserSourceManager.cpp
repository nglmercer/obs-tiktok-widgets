#include "BrowserSourceManager.hpp"
#include <obs.h>
#include <obs-frontend-api.h>
#include <QUuid>
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
bool BrowserSourceManager::add(const WidgetConfig &w, const QString &html, const QString &sceneName, bool reuse)
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
	if (reuse) {
		struct Placement {
			QString id;
			bool found = false;
		} placement{w.id()};
		obs_scene_enum_items(
			scene,
			[](obs_scene_t *, obs_sceneitem_t *item, void *opaque) {
				auto &placement = *static_cast<Placement *>(opaque);
				auto *data = obs_source_get_settings(obs_sceneitem_get_source(item));
				placement.found |= placement.id ==
						   QString::fromUtf8(obs_data_get_string(data, "tiktok_widget_id"));
				obs_data_release(data);
				return !placement.found;
			},
			&placement);
		if (placement.found) {
			obs_source_release(sceneSource);
			return true;
		}
		for (const auto &value : sources()) {
			const auto source = value.toObject();
			if (source["id"] != w.id())
				continue;
			auto *existing = obs_get_source_by_name(source["name"].toString().toUtf8().constData());
			if (!existing)
				continue;
			const auto added = obs_scene_add(scene, existing) != nullptr;
			obs_source_release(existing);
			obs_source_release(sceneSource);
			return added;
		}
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
			// ReloadIgnoreCache reloads the *redirected release*, not the configured
			// stable entry. A harmless CSS nonce triggers obs-browser's supported
			// recreation path and navigates back to local_file. Keep author CSS intact.
			auto css = QString::fromUtf8(obs_data_get_string(d, "css"));
			const auto marker = css.lastIndexOf("\n/* obs-tiktok-reload:");
			if (marker >= 0 && css.endsWith(" */"))
				css.truncate(marker);
			css += "\n/* obs-tiktok-reload:" + QUuid::createUuid().toString(QUuid::WithoutBraces) + " */";
			obs_data_set_string(d, "css", css.toUtf8().constData());
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
static bool removeItem(obs_scene_t *, obs_sceneitem_t *item, void *opaque)
{
	auto *source = obs_sceneitem_get_source(item);
	auto *data = obs_source_get_settings(source);
	const bool same = *static_cast<const QString *>(opaque) ==
			  QString::fromUtf8(obs_data_get_string(data, "tiktok_widget_id"));
	obs_data_release(data);
	if (same)
		obs_sceneitem_remove(item);
	return true;
}
void BrowserSourceManager::remove(const QString &id, const QString &scene)
{
	if (!scene.isEmpty()) {
		auto *source = obs_get_source_by_name(scene.toUtf8().constData());
		if (!source)
			return;
		auto *s = obs_scene_from_source(source);
		if (s)
			obs_scene_enum_items(s, removeItem, const_cast<QString *>(&id));
		obs_source_release(source);
		return;
	}
	Visit v{id, nullptr, {}, true};
	obs_enum_sources(visit, &v);
}
QJsonArray BrowserSourceManager::sources()
{
	QJsonArray array;
	obs_enum_sources(
		[](void *opaque, obs_source_t *source) {
			auto *data = obs_source_get_settings(source);
			auto id = QString::fromUtf8(obs_data_get_string(data, "tiktok_widget_id"));
			if (!id.isEmpty())
				static_cast<QJsonArray *>(opaque)->append(QJsonObject{
					{"id", id},
					{"name", QString::fromUtf8(obs_source_get_name(source))},
					{"localFile", QString::fromUtf8(obs_data_get_string(data, "local_file"))},
					{"width", static_cast<int>(obs_data_get_int(data, "width"))},
					{"height", static_cast<int>(obs_data_get_int(data, "height"))},
					{"active", obs_source_active(source)},
					{"showing", obs_source_showing(source)}});
			obs_data_release(data);
			return true;
		},
		&array);
	return array;
}
} // namespace tt
