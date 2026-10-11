#pragma once
#include <QObject>
#include <QPointer>
#include <QString>
#include <functional>
class QNetworkAccessManager;
class QNetworkReply;
namespace tt {
class PluginConfig;
// Policies are explicit trusted inputs; production always uses the pinned defaults.
struct SigningBundlePolicy {
	QString url;
	QString sha256;
	int timeoutMs = 30000;
	qint64 maxBytes = 2 * 1024 * 1024;
	static SigningBundlePolicy pinned();
};
class SigningBundleManager : public QObject {
	PluginConfig &config;
	SigningBundlePolicy policy;
	QNetworkAccessManager *network;
	QPointer<QNetworkReply> reply;
	std::function<void(QString, QString)> completion;
	QString cached() const;

public:
	SigningBundleManager(PluginConfig &, QObject *parent = nullptr, QNetworkAccessManager *transport = nullptr,
			     SigningBundlePolicy policy = SigningBundlePolicy::pinned());
	~SigningBundleManager() override;
	// A second request shares the download and replaces its pending continuation.
	void ensure(std::function<void(QString bundle, QString error)>);
	void cancel();
	bool isDownloading() const { return !reply.isNull(); }
};
} // namespace tt
