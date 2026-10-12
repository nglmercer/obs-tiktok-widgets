#pragma once
#include "ProjectIO.hpp"
#include "templates/TemplateRegistry.hpp"
namespace tt {
class WidgetProjectService {
	QString root, assets;
	void snapshot(const QString &id, const QJsonObject &metadata) const;
	void checkRevision(const QString &id, const QString &expected) const;
	void commitProject(const QString &id, QJsonObject metadata) const;
	QJsonObject buildUnlocked(const QString &id, bool publish);

public:
	TemplateRegistry templates;
	WidgetProjectService(QString root, QString assets);
	QString directory() const { return root; }
	QString assetDirectory() const { return assets; }
	QString projectPath(const QString &id) const;
	QString outputPath(const QString &id) const;
	QJsonArray list() const;
	QJsonObject get(const QString &id) const;
	QJsonObject create(QString templateId, QString name = {}, QString version = {}, QString id = {});
	QJsonObject duplicate(const QString &id, const QString &expected = {});
	QJsonObject erase(const QString &id, const QString &expected = {}, bool dry = false);
	QJsonObject configure(const QString &id, QJsonObject patch, const QString &expected);
	QJsonObject settings(const QString &id, QJsonObject patch, const QString &expected);
	QStringList files(const QString &id) const;
	QByteArray read(const QString &id, const QString &file) const;
	QJsonObject write(const QString &id, const QString &file, const QByteArray &, const QString &expected);
	QJsonObject fileOperation(const QString &id, const QString &operation, const QString &file,
				  const QString &other, const QString &expected);
	QJsonObject importAsset(const QString &id, const QString &external, const QString &as, const QString &expected);
	QJsonObject validate(const QString &id) const;
	QJsonObject build(const QString &id, const QString &expected = {}, bool publish = false);
	QJsonArray history(const QString &id) const;
	QJsonObject checkpoint(const QString &id, const QString &expected);
	QJsonObject rollback(const QString &id, const QString &revision, const QString &expected);
	QJsonObject migration(const QJsonArray &legacy, bool dry = true);
	QJsonObject restoreMigration(bool dry = true);
	QString preview(const QString &id);
	void exportProject(const QString &id, const QString &out) const;
	QJsonObject importProject(const QString &archive, bool dry = false);
	QString sourceHash(const QString &id) const;
	QJsonObject registry() const;
};
} // namespace tt
