#pragma once
#include "ProjectIO.hpp"
#include <functional>
#include <memory>
namespace tt {
struct BuilderRequest {
	QString root, assets, snapshot, output;
	QJsonObject build;
	std::function<bool()> stale;
};
class BuilderProvider {
public:
	virtual ~BuilderProvider() = default;
	virtual QString id() const = 0;
	virtual int apiVersion() const { return 1; }
	virtual void compile(const BuilderRequest &) const = 0;
};
std::unique_ptr<BuilderProvider> builderProvider(const QJsonObject &);
void validateBuildMode(const QJsonObject &);
QJsonObject builderStatus(const QString &root);
QJsonObject installBuilder(const QString &root, const QString &assets, bool consent);
void compileWidget(const QString &root, const QString &assets, const QString &snapshot, const QString &output,
		   const QJsonObject &build, std::function<bool()> stale = {});
} // namespace tt
