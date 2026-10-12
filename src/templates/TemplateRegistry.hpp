#pragma once
#include "projects/ProjectIO.hpp"
#include <QMap>
namespace tt {
struct TemplateManifest {
	QString id, version, root, entry;
	QJsonObject value, schema;
};
class TemplateRegistry {
	QString assets, config;
	QMap<QString, TemplateManifest> manifests;

public:
	QJsonArray diagnostics;
	TemplateRegistry(QString config, QString assets);
	void discover();
	QJsonArray list() const;
	TemplateManifest resolve(QString id, QString version = {}) const;
	static TemplateManifest validate(const QString &root);
	static QString alias(const QString &id);
};
class TemplatePackageManager {
	QString config;
	TemplateRegistry &registry;

public:
	TemplatePackageManager(QString config, TemplateRegistry &registry);
	QJsonObject install(const QString &archive, bool dryRun = false);
	void exportPackage(const TemplateManifest &, const QString &output) const;
	QJsonObject create(const QString &id, const TemplateManifest &source);
};
void exportZip(const QString &root, const QString &output);
void importZip(const QString &archive, const QString &destination);
} // namespace tt
