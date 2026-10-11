#include "TikTokDock.hpp"
#include "EventMonitor.hpp"
#include "WidgetEditor.hpp"
#include "WidgetGallery.hpp"
#include "obs/BrowserSourceManager.hpp"
#include "obs/OBSFrontendManager.hpp"
#include "core/EventNormalizer.hpp"
#include <QVBoxLayout>
#include <QFormLayout>
#include <QLineEdit>
#include <QLabel>
#include <QPushButton>
#include <QListWidget>
#include <QCheckBox>
#include <QMessageBox>
#include <QInputDialog>
#include <QDesktopServices>
#include <QUrl>
#include <QFile>
#include <QSaveFile>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QCryptographicHash>
#include <QTimer>
namespace tt {
TikTokDock::TikTokDock(PluginConfig &c, TikTokConnectionManager &n, EventDispatcher &d, WidgetManager &w)
	: config(c),
	  connection(n),
	  dispatcher(d),
	  widgets(w)
{
	throughputClock.start();
	auto *l = new QVBoxLayout(this);
	auto *form = new QFormLayout;
	username = new QLineEdit(c.settings["username"].toString());
	bundlePath = new QLineEdit(c.settings["bundlePath"].toString());
	sessionPath = new QLineEdit;
	sessionPath->setPlaceholderText(tr("Optional private cookie-header file; never persisted"));
	retry = new QCheckBox(tr("Auto reconnect (applies on next connection)"));
	retry->setChecked(c.settings["autoReconnect"].toBool(true));
	autoConnect = new QCheckBox(tr("Connect when OBS starts"));
	autoConnect->setChecked(c.settings["autoConnect"].toBool());
	status = new QLabel;
	status->setWordWrap(true);
	form->addRow(tr("TikTok username"), username);
	form->addRow(tr("Trusted bundle path"), bundlePath);
	form->addRow(tr("Session file"), sessionPath);
	l->addLayout(form);
	l->addWidget(retry);
	l->addWidget(autoConnect);
	l->addWidget(status);
	auto button = [this, l](const QString &text, std::function<void()> fn) {
		auto *b = new QPushButton(text);
		l->addWidget(b);
		connect(b, &QPushButton::clicked, this, [this, fn] { guarded(fn); });
	};
	button(tr("Connect"), [this] { connectRoom(); });
	button(tr("Disconnect"), [this] { connection.disconnect(); });
	button(tr("Reconnect"), [this] {
		connection.disconnect();
		connectRoom();
	});
	button(tr("Download pinned signing bundle"), [this] {
		auto *network = new QNetworkAccessManager(this);
		QNetworkRequest request(QUrl(PluginConfig::bundleUrl()));
		request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
		auto *reply = network->get(request);
		QTimer::singleShot(30000, reply, [reply] {
			if (reply->isRunning())
				reply->abort();
		});
		connect(reply, &QNetworkReply::downloadProgress, reply, [reply](qint64 bytes, qint64) {
			if (bytes > 2 * 1024 * 1024)
				reply->abort();
		});
		connect(reply, &QNetworkReply::finished, this, [this, reply, network] {
			guarded([this, reply] {
				auto bytes = reply->readAll();
				if (reply->error() != QNetworkReply::NoError ||
				    QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex() !=
					    PluginConfig::bundleHash().toLatin1())
					throw std::runtime_error("Trusted bundle download failed or checksum mismatch");
				QSaveFile file(config.directory + "/webmssdk-1.0.0.388.js");
				if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() ||
				    !file.commit())
					throw std::runtime_error("Cannot cache verified signing bundle");
				bundlePath->clear();
				status->setText(tr("Verified signing bundle cached"));
			});
			reply->deleteLater();
			network->deleteLater();
		});
	});
	list = new QListWidget;
	l->addWidget(list);
	refreshList();
	button(tr("Create widget"), [this] {
		auto type = WidgetGallery::choose(this);
		if (type.isEmpty())
			return;
		auto widget = WidgetConfig::create(type);
		if (!WidgetEditor::edit(widget, this))
			return;
		widgets.widgets.push_back(widget);
		try {
			widgets.save();
		} catch (...) {
			widgets.widgets.removeLast();
			throw;
		}
		refreshList();
	});
	button(tr("Configure widget"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto copy = widgets.widgets[i];
		if (WidgetEditor::edit(copy, this)) {
			widgets.materialize(copy);
			widgets.widgets[i] = copy;
			widgets.save();
			BrowserSourceManager::refresh(copy, widgets.materialize(copy));
			refreshList();
		}
	});
	button(tr("Duplicate widget"), [this] {
		auto i = list->currentRow();
		if (i >= 0) {
			widgets.duplicate(widgets.widgets[i].id());
			refreshList();
		}
	});
	button(tr("Delete widget"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto id = widgets.widgets[i].id();
		auto answer = QMessageBox::question(this, tr("Delete widget"),
						    tr("Remove its OBS Browser Sources too?"),
						    QMessageBox::Yes | QMessageBox::No | QMessageBox::Cancel);
		if (answer == QMessageBox::Cancel)
			return;
		if (answer == QMessageBox::Yes)
			BrowserSourceManager::remove(id);
		widgets.erase(id);
		refreshList();
	});
	button(tr("Remove widget Browser Sources"), [this] {
		auto i = list->currentRow();
		if (i >= 0 &&
		    QMessageBox::question(this, tr("Remove sources"),
					  tr("Remove all Browser Sources for this widget?")) == QMessageBox::Yes)
			BrowserSourceManager::remove(widgets.widgets[i].id());
	});
	button(tr("Add to current scene"), [this] {
		auto i = list->currentRow();
		if (i >= 0 && !BrowserSourceManager::add(widgets.widgets[i], widgets.materialize(widgets.widgets[i])))
			throw std::runtime_error("Cannot create browser_source in current scene");
	});
	button(tr("Add to selected scene"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		bool ok = false;
		auto scene = QInputDialog::getItem(this, tr("Select scene"), tr("Scene"), OBSFrontendManager::scenes(),
						   0, false, &ok);
		if (ok &&
		    !BrowserSourceManager::add(widgets.widgets[i], widgets.materialize(widgets.widgets[i]), scene))
			throw std::runtime_error("Cannot create Browser Source");
	});
	button(tr("Preview widget"), [this] {
		auto i = list->currentRow();
		if (i >= 0)
			QDesktopServices::openUrl(
				QUrl::fromLocalFile(widgets.materialize(widgets.widgets[i])).toString() + "?preview=1");
	});
	button(tr("Reset widget settings"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto &old = widgets.widgets[i];
		auto fresh = WidgetConfig::create(old.type());
		fresh.value["id"] = old.id();
		fresh.value["name"] = old.name();
		old = fresh;
		widgets.save();
		BrowserSourceManager::refresh(old, widgets.materialize(old));
	});
	button(tr("Generate test events"), [this] {
		static int sequence = 0;
		++sequence;
		for (auto type : {"chat", "like", "follow", "roomUser", "state", "unknown"})
			dispatcher.push(EventNormalizer::synthetic(type, sequence));
		for (int i = 1; i <= 3; ++i) {
			auto e = EventNormalizer::synthetic("gift", i);
			e["messageId"] = QString("fixture-gift-%1-%2").arg(sequence).arg(i);
			auto data = e["data"].toObject();
			data["group_id"] = QString("fixture-streak-%1").arg(sequence);
			e["data"] = data;
			dispatcher.push(e);
		}
	});
	monitor = new EventMonitor;
	l->addWidget(monitor);
	setMinimumWidth(320);
	auto persist = [this] {
		config.settings["autoConnect"] = autoConnect->isChecked();
		config.settings["autoReconnect"] = retry->isChecked();
		config.settings["username"] = username->text();
		config.settings["bundlePath"] = bundlePath->text();
		guarded([this] { config.save(); });
	};
	connect(autoConnect, &QCheckBox::toggled, this, persist);
	connect(retry, &QCheckBox::toggled, this, persist);
	connect(username, &QLineEdit::editingFinished, this, persist);
	connect(bundlePath, &QLineEdit::editingFinished, this, persist);
}
void TikTokDock::guarded(std::function<void()> fn)
{
	try {
		fn();
	} catch (const std::exception &e) {
		QMessageBox::warning(this, tr("TikTok LIVE Widgets"), QString::fromUtf8(e.what()));
	}
}
void TikTokDock::refreshList()
{
	list->clear();
	for (const auto &w : widgets.widgets)
		list->addItem(w.name() + " (" + w.type() + ")");
}
void TikTokDock::connectRoom()
{
	QString cookies;
	if (!sessionPath->text().isEmpty()) {
		QFile file(sessionPath->text());
		if (!file.open(QIODevice::ReadOnly) || file.size() > 64 * 1024)
			throw std::runtime_error("Cannot read private session file");
		cookies = QString::fromUtf8(file.readAll()).trimmed();
	}
	connection.configure(config.verifiedBundle(bundlePath->text()), cookies);
	connection.setAutoReconnect(retry->isChecked());
	connection.connect(username->text());
	config.settings["username"] = username->text();
	config.settings["bundlePath"] = bundlePath->text();
	config.settings["autoConnect"] = autoConnect->isChecked();
	config.settings["autoReconnect"] = retry->isChecked();
	config.save();
}
void TikTokDock::startAutoConnect()
{
	if (autoConnect->isChecked())
		guarded([this] { connectRoom(); });
}
void TikTokDock::updateStatus(const QString &bridgeError)
{
	auto s = connection.stateSnapshot();
	if (!widgets.restorationError.isEmpty())
		status->setToolTip(tr("Widget restore: ") + widgets.restorationError);
	auto stats = dispatcher.snapshot();
	if (throughputClock.elapsed() >= 1000) {
		eventsPerSecond =
			static_cast<double>(stats.accepted - previousAccepted) * 1000.0 / throughputClock.restart();
		previousAccepted = stats.accepted;
	}
	status->setText(
		QString("%1 %2\n%3\nAccepted %4, delivered %5, overflow %6, oversized %7, duplicate %8, failed %9; %10 events/s; bus coalesced %11")
			.arg(s["data"].toObject()["state"].toString(), connection.getUsername(),
			     bridgeError.isEmpty() ? connection.lastError() : bridgeError)
			.arg(stats.accepted)
			.arg(stats.delivered)
			.arg(stats.overflow)
			.arg(stats.oversize)
			.arg(stats.duplicate)
			.arg(stats.failed)
			.arg(eventsPerSecond, 0, 'f', 1)
			.arg(stats.coalesced));
}
} // namespace tt
