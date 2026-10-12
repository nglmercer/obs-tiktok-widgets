#pragma once
#include <QStringList>
namespace tt {
class WidgetRegistry {
public:
	static QStringList templates(const QString &configDirectory = {}, const QString &assetDirectory = {});
};
} // namespace tt
