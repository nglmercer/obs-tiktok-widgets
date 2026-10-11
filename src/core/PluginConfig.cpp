#include "PluginConfig.hpp"
#include <QDir>
#include <QFile>
#include <QSaveFile>
#include <QJsonDocument>
#include <QCryptographicHash>
#include <stdexcept>
namespace tt {
PluginConfig::PluginConfig(QString d) : directory(std::move(d))
{
	QDir().mkpath(directory);
	load();
}
void PluginConfig::load()
{
	QFile f(directory + "/settings.json");
	if (f.open(QIODevice::ReadOnly))
		settings = QJsonDocument::fromJson(f.readAll()).object();
}
void PluginConfig::save() const
{
	QSaveFile f(directory + "/settings.json");
	if (!f.open(QIODevice::WriteOnly) || f.write(QJsonDocument(settings).toJson()) < 0 || !f.commit())
		throw std::runtime_error("Cannot save plugin settings");
}
QString PluginConfig::bundleUrl()
{
	return "https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/webmssdk/1.0.0.388/webmssdk.js";
}
QString PluginConfig::bundleHash()
{
	return "dee22566273d398e074df6db40f39cfd827f6b8efd6fc382de03c44c501299ac";
}
QString PluginConfig::verifiedBundle(const QString &local) const
{
	QFile f(local.isEmpty() ? directory + "/webmssdk-1.0.0.388.js" : local);
	if (!f.open(QIODevice::ReadOnly))
		throw std::runtime_error("Signing bundle missing. Connect will automatically download and verify it.");
	if (f.size() > 2 * 1024 * 1024)
		throw std::runtime_error("Signing bundle exceeds size limit");
	auto source = f.readAll();
	if (QCryptographicHash::hash(source, QCryptographicHash::Sha256).toHex() != bundleHash().toLatin1())
		throw std::runtime_error("Signing bundle SHA-256 mismatch; bundle rejected");
	return QString::fromUtf8(source);
}
} // namespace tt
