#include "widgets/WidgetManager.hpp"
#include <obs.h>
#include <QCoreApplication>
#include <QTemporaryDir>
#include <stdexcept>
#include <cstring>
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
	obs_register_source(&info);
	QTemporaryDir dir;
	tt::WidgetManager manager(dir.path(), WIDGET_ASSETS);
	auto widget = manager.create("gifts");
	manager.save();
	auto *settings = obs_data_create();
	obs_data_set_string(settings, "tiktok_widget_id", widget.id().toUtf8().constData());
	obs_data_set_string(settings, "local_file", manager.materialize(widget).toUtf8().constData());
	obs_data_set_bool(settings, "is_local_file", true);
	obs_data_set_int(settings, "width", widget.width());
	auto *source = obs_source_create("browser_source", "Production gift", settings, nullptr);
	if (!source)
		throw std::runtime_error("mock source creation");
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
	obs_shutdown();
}
