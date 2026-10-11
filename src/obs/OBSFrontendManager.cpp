#include "OBSFrontendManager.hpp"
#include <obs-frontend-api.h>
namespace tt {
QStringList OBSFrontendManager::scenes()
{
	obs_frontend_source_list list{};
	obs_frontend_get_scenes(&list);
	QStringList out;
	for (size_t i = 0; i < list.sources.num; ++i)
		out.push_back(QString::fromUtf8(obs_source_get_name(list.sources.array[i])));
	obs_frontend_source_list_free(&list);
	return out;
}
} // namespace tt
