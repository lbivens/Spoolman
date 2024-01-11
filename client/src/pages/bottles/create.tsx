import React, { useState } from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber, Radio, Divider, Button } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { IResin } from "../resins/model";
import { IBottle } from "./model";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { useBottlemanLocations } from "../../components/otherModels";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import "../../utils/overrides.css";

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const BottleCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();

  const { form, formProps, formLoading, onFinish, redirect } = useForm<IBottle>({
    redirect: false,
    warnWhenUnsavedChanges: false,
  });

  if (props.mode === "clone" && formProps.initialValues) {
    // Clear out the values that we don't want to clone
    formProps.initialValues.first_used = null;
    formProps.initialValues.last_used = null;
    formProps.initialValues.used_weight = 0;

    // Fix the resin_id
    formProps.initialValues.resin_id = formProps.initialValues.resin.id;
  }

  const handleSubmit = async (redirectTo: "list" | "edit" | "create") => {
    const values = await form.validateFields();
    if (quantity > 1) {
      const submit = Array(quantity).fill(values);
      // queue multiple creates this way for now Refine doesn't seem to map Arrays to createMany or multiple creates like it says it does
      submit.forEach(async (r) => await onFinish(r));
    } else {
      await onFinish(values);
    }
    redirect(redirectTo, (values as IBottle).id);
  };

  const { queryResult } = useSelect<IResin>({
    resource: "resin",
  });

  const resinOptions = queryResult.data?.data.map((item) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    let name = item.name;
    if (!name) {
      name = `ID: ${item.id}`;
    }
    let material = "";
    if (item.material) {
      material = ` - ${item.material}`;
    }
    const label = `${vendorPrefix}${name}${material}`;

    return {
      label: label,
      value: item.id,
      weight: item.weight,
      bottle_weight: item.bottle_weight,
    };
  });
  resinOptions?.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const [weightToEnter, setWeightToEnter] = useState(1);
  const [usedWeight, setUsedWeight] = useState(0);

  const selectedResinID = Form.useWatch("resin_id", form);
  const selectedResin = resinOptions?.find((obj) => {
    return obj.value === selectedResinID;
  });
  const resinWeight = selectedResin?.weight || 0;
  const bottleWeight = selectedResin?.bottle_weight || 0;

  const resinChange = (newID: number) => {
    const newSelectedResin = resinOptions?.find((obj) => {
      return obj.value === newID;
    });
    const newResinWeight = newSelectedResin?.weight || 0;
    const newBottleWeight = newSelectedResin?.bottle_weight || 0;

    if (weightToEnter >= 3) {
      if (!(newResinWeight && newBottleWeight)) {
        setWeightToEnter(2);
      }
    }
    if (weightToEnter >= 2) {
      if (!newResinWeight) {
        setWeightToEnter(1);
      }
    }
  };

  const weightChange = (weight: number) => {
    setUsedWeight(weight);
    form.setFieldsValue({
      used_weight: weight,
    });
  };

  const locations = useBottlemanLocations(true);
  const [newLocation, setNewLocation] = useState("");

  const allLocations = [...(locations.data || [])];
  if (newLocation.trim() && !allLocations.includes(newLocation)) {
    allLocations.push(newLocation.trim());
  }

  const [quantity, setQuantity] = useState(1);
  const incrementQty = () => {
    setQuantity(quantity + 1);
  };

  const decrementQty = () => {
    setQuantity(quantity - 1);
  };

  return (
    <Create
      title={props.mode === "create" ? t("bottle.titles.create") : t("bottle.titles.clone")}
      isLoading={formLoading}
      footerButtons={() => (
        <>
          <div
            style={{ display: "flex", backgroundColor: "#141414", border: "1px solid #424242", borderRadius: "6px" }}
          >
            <Button type="text" style={{ padding: 0, width: 32, height: 32 }} onClick={decrementQty}>
              <MinusOutlined />
            </Button>
            <InputNumber name="Quantity" min={1} id="qty-input" controls={false} value={quantity}></InputNumber>
            <Button type="text" style={{ padding: 0, width: 32, height: 32 }} onClick={incrementQty}>
              <PlusOutlined />
            </Button>
          </div>
          <Button type="primary" onClick={() => handleSubmit("list")}>
            {t("buttons.save")}
          </Button>
          <Button type="primary" onClick={() => handleSubmit("create")}>
            {t("buttons.saveAndAdd")}
          </Button>
        </>
      )}
    >
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("bottle.fields.first_used")}
          name={["first_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.last_used")}
          name={["last_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.resin")}
          name={["resin_id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select
            options={resinOptions}
            showSearch
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
            onChange={(value) => {
              resinChange(value);
            }}
          />
        </Form.Item>

        <Form.Item hidden={true} name={["used_weight"]} initialValue={0}>
          <InputNumber value={usedWeight} />
        </Form.Item>

        <Form.Item label={t("bottle.fields.weight_to_use")} help={t("bottle.fields_help.weight_to_use")}>
          <Radio.Group
            onChange={(value) => {
              setWeightToEnter(value.target.value);
            }}
            defaultValue={1}
            value={weightToEnter}
          >
            <Radio.Button value={1}>{t("bottle.fields.used_weight")}</Radio.Button>
            <Radio.Button value={2} disabled={!resinWeight}>
              {t("bottle.fields.remaining_weight")}
            </Radio.Button>
            <Radio.Button value={3} disabled={!(resinWeight && bottleWeight)}>
              {t("bottle.fields.measured_weight")}
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={t("bottle.fields.used_weight")} help={t("bottle.fields_help.used_weight")} initialValue={0}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 1}
            value={usedWeight}
            onChange={(value) => {
              weightChange(value ?? 0);
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.remaining_weight")}
          help={t("bottle.fields_help.remaining_weight")}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 2}
            value={resinWeight ? resinWeight - usedWeight : 0}
            onChange={(value) => {
              weightChange(resinWeight - (value ?? 0));
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.measured_weight")}
          help={t("bottle.fields_help.measured_weight")}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 3}
            value={resinWeight && bottleWeight ? resinWeight - usedWeight + bottleWeight : 0}
            onChange={(value) => {
              weightChange(resinWeight - ((value ?? 0) - bottleWeight));
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.location")}
          help={t("bottle.fields_help.location")}
          name={["location"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Select
            dropdownRender={(menu) => (
              <>
                {menu}
                <Divider style={{ margin: "8px 0" }} />
                <Input
                  placeholder={t("bottle.form.new_location_prompt")}
                  value={newLocation}
                  onChange={(event) => setNewLocation(event.target.value)}
                />
              </>
            )}
            loading={locations.isLoading}
            options={allLocations.map((item) => ({ label: item, value: item }))}
          />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.lot_nr")}
          help={t("bottle.fields_help.lot_nr")}
          name={["lot_nr"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
      </Form>
    </Create>
  );
};

export default BottleCreate;
