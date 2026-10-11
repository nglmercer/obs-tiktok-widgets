#pragma once
#include <QString>
#include <QJsonObject>
namespace tt {
class PluginConfig {
public:
	QString directory;
	QJsonObject settings;
	explicit PluginConfig(QString);
	void load();
	void save() const;
	QString verifiedBundle(const QString &localPath) const;
	static QString bundleUrl();
	static QString bundleHash();
};
} // namespace tt
