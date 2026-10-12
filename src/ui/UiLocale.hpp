#pragma once
#include <QApplication>
#include <QTranslator>
#include <QAbstractButton>
#include <QLabel>
#include <QGroupBox>
#include <QAction>
#include <QComboBox>
#include <QTabWidget>
#include <QLineEdit>
#include <QPointer>
#include <functional>
#include <QMessageBox>
namespace tt {
inline QString uiTr(const QString &source)
{
	auto translated = QCoreApplication::translate("TikTokWidgets", source.toUtf8().constData());
	if (translated == source && source.contains(" · ")) {
		auto segments = source.split(" · ");
		for (auto &segment : segments)
			segment = QCoreApplication::translate("TikTokWidgets", segment.toUtf8().constData());
		translated = segments.join(" · ");
	}
	return translated;
}
inline QMessageBox::StandardButton uiQuestion(QWidget *parent, const QString &title, const QString &message,
					      QMessageBox::StandardButtons buttons = QMessageBox::Yes | QMessageBox::No,
					      QMessageBox::StandardButton defaultButton = QMessageBox::NoButton)
{
	QMessageBox box(QMessageBox::Question, uiTr(title), uiTr(message), buttons, parent);
	box.setDefaultButton(defaultButton);
	for (const auto &entry : QList<QPair<QMessageBox::StandardButton, QString>>{{QMessageBox::Yes, "Yes"},
										    {QMessageBox::No, "No"},
										    {QMessageBox::Cancel, "Cancel"}})
		if (auto *button = box.button(entry.first))
			button->setText(uiTr(entry.second));
	return static_cast<QMessageBox::StandardButton>(box.exec());
}
class UiLocale : public QObject {
	QTranslator translator;
	QString assets;
	QList<std::function<void()>> updates;

public:
	explicit UiLocale(const QString &directory, QObject *parent) : QObject(parent), assets(directory) {}
	void bind(QWidget *root)
	{
		for (auto *object : root->findChildren<QObject *>()) {
			if (auto *button = qobject_cast<QAbstractButton *>(object)) {
				const auto source = button->text();
				QPointer<QAbstractButton> p(button);
				updates.append([p, source] {
					if (p)
						p->setText(uiTr(source));
				});
			} else if (auto *label = qobject_cast<QLabel *>(object)) {
				const auto source = label->text();
				if (!source.isEmpty()) {
					QPointer<QLabel> p(label);
					updates.append([p, source] {
						if (p)
							p->setText(uiTr(source));
					});
				}
			} else if (auto *group = qobject_cast<QGroupBox *>(object)) {
				const auto source = group->title();
				QPointer<QGroupBox> p(group);
				updates.append([p, source] {
					if (p)
						p->setTitle(uiTr(source));
				});
			} else if (auto *action = qobject_cast<QAction *>(object)) {
				const auto source = action->text(), tip = action->toolTip();
				QPointer<QAction> p(action);
				updates.append([p, source, tip] {
					if (p) {
						p->setText(uiTr(source));
						p->setToolTip(uiTr(tip));
					}
				});
			}
			if (auto *combo = qobject_cast<QComboBox *>(object)) {
				for (int i = 0; i < combo->count(); ++i) {
					const auto source = combo->itemText(i);
					QPointer<QComboBox> p(combo);
					updates.append([p, i, source] {
						if (p)
							p->setItemText(i, uiTr(source));
					});
				}
			}
			if (auto *tabs = qobject_cast<QTabWidget *>(object)) {
				for (int i = 0; i < tabs->count(); ++i) {
					const auto source = tabs->tabText(i);
					QPointer<QTabWidget> p(tabs);
					updates.append([p, i, source] {
						if (p)
							p->setTabText(i, uiTr(source));
					});
				}
			}
			if (auto *line = qobject_cast<QLineEdit *>(object)) {
				const auto source = line->placeholderText();
				QPointer<QLineEdit> p(line);
				updates.append([p, source] {
					if (p)
						p->setPlaceholderText(uiTr(source));
				});
			}
			if (auto *widget = qobject_cast<QWidget *>(object)) {
				const auto name = widget->accessibleName(), tip = widget->toolTip();
				QPointer<QWidget> p(widget);
				updates.append([p, name, tip] {
					if (p) {
						p->setAccessibleName(uiTr(name));
						p->setToolTip(uiTr(tip));
					}
				});
			}
		}
	}
	bool setLocale(const QString &locale)
	{
		qApp->removeTranslator(&translator);
		const bool loaded = locale != "es" || translator.load(assets + "/i18n/es.qm");
		if (locale == "es" && loaded)
			qApp->installTranslator(&translator);
		for (const auto &update : updates)
			update();
		return loaded;
	}
	~UiLocale() override { qApp->removeTranslator(&translator); }
};
} // namespace tt
