#include "SigningBundleManager.hpp"
#include "PluginConfig.hpp"
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QFile>
#include <QSaveFile>
#include <QCryptographicHash>
#include <QTimer>
#include <stdexcept>
namespace tt {
SigningBundlePolicy SigningBundlePolicy::pinned()
{
	return {PluginConfig::bundleUrl(), PluginConfig::bundleHash()};
}
SigningBundleManager::SigningBundleManager(PluginConfig &c, QObject *parent, QNetworkAccessManager *transport,
					   SigningBundlePolicy p)
	: QObject(parent),
	  config(c),
	  policy(std::move(p)),
	  network(transport ? transport : new QNetworkAccessManager(this))
{
}
SigningBundleManager::~SigningBundleManager()
{
	cancel();
}
QString SigningBundleManager::cached() const
{
	const auto local = config.settings["trustedBundlePath"].toString();
	QFile file(local.isEmpty() ? config.directory + "/webmssdk-1.0.0.388.js" : local);
	if (!file.open(QIODevice::ReadOnly) || file.size() > policy.maxBytes)
		return {};
	const auto bytes = file.readAll();
	if (QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex() != policy.sha256.toLatin1())
		return {};
	return QString::fromUtf8(bytes);
}
void SigningBundleManager::ensure(std::function<void(QString, QString)> callback)
{
	completion = std::move(callback);
	if (reply)
		return;
	const auto source = cached();
	if (!source.isEmpty()) {
		auto done = std::move(completion);
		completion = {};
		done(source, {});
		return;
	}
	QNetworkRequest request{QUrl(policy.url)};
	request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
	request.setTransferTimeout(policy.timeoutMs);
	request.setRawHeader("User-Agent", "obs-tiktok-widgets/1.0");
	auto *download = network->get(request);
	reply = download;
	download->setReadBufferSize(policy.maxBytes + 1);
	auto *deadline = new QTimer(download);
	deadline->setSingleShot(true);
	connect(deadline, &QTimer::timeout, download, [download] { download->abort(); });
	deadline->start(policy.timeoutMs);
	connect(download, &QNetworkReply::downloadProgress, download, [this, download](qint64 received, qint64) {
		if (received > policy.maxBytes)
			download->abort();
	});
	connect(download, &QIODevice::readyRead, download, [this, download] {
		if (download->bytesAvailable() > policy.maxBytes)
			download->abort();
	});
	connect(download, &QNetworkReply::finished, this, [this, download] {
		if (reply != download)
			return;
		QString source, error;
		try {
			const auto bytes = download->readAll();
			if (download->error() != QNetworkReply::NoError)
				throw std::runtime_error(
					"Automatic setup could not download the signing bundle. Check your connection and try Connect again.");
			if (download->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() != 200)
				throw std::runtime_error(
					"Automatic setup received an unexpected download response. Try Connect again.");
			if (bytes.size() > policy.maxBytes ||
			    QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex() !=
				    policy.sha256.toLatin1())
				throw std::runtime_error(
					"Automatic setup rejected the download because its checksum did not match. Please try again later.");
			QSaveFile file(config.directory + "/webmssdk-1.0.0.388.js");
			if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit())
				throw std::runtime_error(
					"Automatic setup could not save the verified bundle. Check OBS configuration directory permissions.");
			source = QString::fromUtf8(bytes);
		} catch (const std::exception &e) {
			error = QString::fromUtf8(e.what());
		}
		reply = nullptr;
		download->deleteLater();
		auto done = std::move(completion);
		completion = {};
		if (done)
			done(source, error);
	});
}
void SigningBundleManager::cancel()
{
	completion = {};
	auto *download = reply.data();
	reply = nullptr;
	if (download) {
		download->abort();
		download->deleteLater();
	}
}
} // namespace tt
