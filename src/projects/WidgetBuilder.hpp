#pragma once
#include "ProjectIO.hpp"
#include <functional>
namespace tt {
void validateBuildMode(const QJsonObject &);
QJsonObject builderStatus(const QString &root);
QJsonObject installBuilder(const QString &root, const QString &assets, bool consent);
void compileWidget(const QString &root, const QString &assets, const QString &snapshot, const QString &output,
		   const QJsonObject &build, std::function<bool()> stale = {});
} // namespace tt
