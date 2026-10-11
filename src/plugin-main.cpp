#include <obs-module.h>
#include <obs-frontend-api.h>
#include <QCoreApplication>
#include <QThread>
#include "obs/PluginLifecycle.hpp"
OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("obs-tiktok-widgets", "en-US")
MODULE_EXPORT const char *obs_module_description(void)
{
	return "One native TikTok LIVE connection for every OBS Browser Source";
}
static tt::PluginLifecycle *plugin = nullptr;
static void frontend(enum obs_frontend_event event, void *)
{
	if (event == OBS_FRONTEND_EVENT_FINISHED_LOADING) {
		try {
			if (plugin)
				plugin->start();
		} catch (const std::exception &e) {
			blog(LOG_ERROR, "[obs-tiktok-widgets] %s", e.what());
		}
	}
	if (event == OBS_FRONTEND_EVENT_EXIT && plugin)
		plugin->stop();
}
bool obs_module_load(void)
{
	plugin = new tt::PluginLifecycle;
	obs_frontend_add_event_callback(frontend, nullptr);
	return true;
}
void obs_module_unload(void)
{
	obs_frontend_remove_event_callback(frontend, nullptr);
	delete plugin;
	plugin = nullptr;
}
